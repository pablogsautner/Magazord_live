import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const roletaRouter = new Hono();

const TIPOS_VALIDOS = ['cupom', 'sem_premio'];

// Sorteio ponderado: cada item ocupa uma fatia do intervalo [0, pesoTotal)
// proporcional ao seu peso. Roda aqui (não no navegador) — senão a trava de
// "1 giro por pessoa" não vale nada, dava pra forjar o resultado no client.
function sortearItem(itens: any[]) {
  const pesoTotal = itens.reduce((soma, item) => soma + Number(item.peso), 0);
  const alvo = Math.random() * pesoTotal;
  let acumulado = 0;
  for (const item of itens) {
    acumulado += Number(item.peso);
    if (alvo < acumulado) return item;
  }
  return itens[itens.length - 1];
}

function obterIp(c: any): string {
  const encaminhado = c.req.header('x-forwarded-for');
  if (encaminhado) return encaminhado.split(',')[0].trim();
  return 'desconhecido';
}

// Pública — o espectador vê a roleta sem precisar de login.
roletaRouter.get('/:liveId', async (c) => {
  const liveId = c.req.param('liveId');
  const supabase = getSupabase();

  const { data: roleta, error: erroRoleta } = await supabase.from('roletas').select().eq('live_id', liveId).single();
  if (erroRoleta) return c.json({ error: 'roleta_nao_encontrada' }, 404);

  const { data: itens, error: erroItens } = await supabase
    .from('roleta_itens')
    .select()
    .eq('live_id', liveId)
    .order('ordem');
  if (erroItens) return c.json({ error: 'query_failed', message: erroItens.message }, 500);

  return c.json({ ...roleta, itens: itens ?? [] });
});

// Autenticada — só quem administra a live edita a roleta. Substitui a lista
// de itens inteira quando enviada (mais simples que diffar item a item, e é
// como o form do admin já trabalha: a lista toda de uma vez).
roletaRouter.patch('/:liveId', requireUser, async (c) => {
  const user = c.get('user') as { id: string };
  const liveId = c.req.param('liveId');

  const empresaId = await empresaIdDaLive(liveId).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const { ativa, itens } = await c.req.json();
  const supabase = getSupabase();

  if (typeof ativa === 'boolean') {
    const { error } = await supabase
      .from('roletas')
      .upsert({ live_id: liveId, ativa, atualizado_em: new Date().toISOString() });
    if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  } else {
    await supabase.from('roletas').upsert({ live_id: liveId }, { onConflict: 'live_id', ignoreDuplicates: true });
  }

  if (Array.isArray(itens)) {
    for (const item of itens) {
      if (!TIPOS_VALIDOS.includes(item.tipo)) {
        return c.json({ error: 'tipo_invalido', message: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` }, 400);
      }
      if (!(Number(item.peso) > 0)) {
        return c.json({ error: 'peso_invalido', message: 'peso deve ser maior que zero' }, 400);
      }
    }

    const { error: erroDelete } = await supabase.from('roleta_itens').delete().eq('live_id', liveId);
    if (erroDelete) return c.json({ error: 'update_failed', message: erroDelete.message }, 500);

    if (itens.length > 0) {
      const { error: erroInsert } = await supabase.from('roleta_itens').insert(
        itens.map((item: any, indice: number) => ({
          live_id: liveId,
          tipo: item.tipo,
          coupon_id: item.coupon_id ?? null,
          codigo: item.codigo ?? null,
          descricao: item.descricao,
          tipo_desconto: item.tipo_desconto ?? null,
          valor_desconto: item.valor_desconto ?? null,
          peso: item.peso,
          ordem: indice,
        }))
      );
      if (erroInsert) return c.json({ error: 'update_failed', message: erroInsert.message }, 500);
    }
  }

  const { data: roleta } = await supabase.from('roletas').select().eq('live_id', liveId).single();
  const { data: itensSalvos } = await supabase.from('roleta_itens').select().eq('live_id', liveId).order('ordem');
  return c.json({ ...roleta, itens: itensSalvos ?? [] });
});

// Pública — o espectador gira sem login. session_id vem do front (gerado e
// guardado no localStorage de quem assiste, 1 vez por navegador); o IP é
// capturado aqui, não confia em nada que o client mande sobre isso.
roletaRouter.post('/:liveId/girar', async (c) => {
  const liveId = c.req.param('liveId');
  const { session_id } = await c.req.json();
  if (!session_id || typeof session_id !== 'string') {
    return c.json({ error: 'session_id_obrigatorio' }, 400);
  }
  const ip = obterIp(c);
  const supabase = getSupabase();

  const { data: roleta, error: erroRoleta } = await supabase.from('roletas').select().eq('live_id', liveId).single();
  if (erroRoleta) return c.json({ error: 'roleta_nao_encontrada' }, 404);
  if (!(roleta as any).ativa) return c.json({ error: 'roleta_inativa' }, 400);

  const [porSessao, porIp] = await Promise.all([
    supabase.from('roleta_giros').select('roleta_item_id').eq('live_id', liveId).eq('session_id', session_id).maybeSingle(),
    supabase.from('roleta_giros').select('roleta_item_id').eq('live_id', liveId).eq('ip', ip).limit(1).maybeSingle(),
  ]);
  const giroExistente = (porSessao.data ?? porIp.data) as { roleta_item_id: string } | null;

  if (giroExistente) {
    const { data: itemAnterior } = await supabase.from('roleta_itens').select().eq('id', giroExistente.roleta_item_id).single();
    return c.json({ error: 'ja_girou', item: itemAnterior ?? null }, 409);
  }

  const { data: itens, error: erroItens } = await supabase.from('roleta_itens').select().eq('live_id', liveId);
  if (erroItens) return c.json({ error: 'query_failed', message: erroItens.message }, 500);
  if (!itens || itens.length === 0) return c.json({ error: 'roleta_sem_itens' }, 400);

  const vencedor = sortearItem(itens);

  const { error: erroInsert } = await supabase
    .from('roleta_giros')
    .insert({ live_id: liveId, session_id, ip, roleta_item_id: vencedor.id });
  if (erroInsert) {
    if (erroInsert.code === '23505') return c.json({ error: 'ja_girou' }, 409);
    return c.json({ error: 'insert_failed', message: erroInsert.message }, 500);
  }

  return c.json({ item: vencedor });
});
