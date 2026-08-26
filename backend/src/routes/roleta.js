import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const roletaRouter = Router();

const TIPOS_VALIDOS = ['cupom', 'sem_premio'];

// Sorteio ponderado: cada item ocupa uma fatia do intervalo [0, pesoTotal)
// proporcional ao seu peso. Roda aqui (não no navegador) — senão a trava de
// "1 giro por pessoa" não vale nada, dava pra forjar o resultado no client.
function sortearItem(itens) {
  const pesoTotal = itens.reduce((soma, item) => soma + Number(item.peso), 0);
  const alvo = Math.random() * pesoTotal;
  let acumulado = 0;
  for (const item of itens) {
    acumulado += Number(item.peso);
    if (alvo < acumulado) return item;
  }
  return itens[itens.length - 1];
}

function obterIp(req) {
  const encaminhado = req.headers['x-forwarded-for'];
  if (typeof encaminhado === 'string' && encaminhado.length > 0) return encaminhado.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'desconhecido';
}

// Pública — o espectador vê a roleta sem precisar de login.
roletaRouter.get('/:liveId', async (req, res) => {
  const supabase = getSupabase();
  const { data: roleta, error: erroRoleta } = await supabase
    .from('roletas')
    .select()
    .eq('live_id', req.params.liveId)
    .single();
  if (erroRoleta) return res.status(404).json({ error: 'roleta_nao_encontrada' });

  const { data: itens, error: erroItens } = await supabase
    .from('roleta_itens')
    .select()
    .eq('live_id', req.params.liveId)
    .order('ordem');
  if (erroItens) return res.status(500).json({ error: 'query_failed', message: erroItens.message });

  res.json({ ...roleta, itens: itens ?? [] });
});

// Autenticada — só quem administra a live edita a roleta. Substitui a lista
// de itens inteira quando enviada (mais simples que diffar item a item, e é
// como o form do admin já trabalha: a lista toda de uma vez).
roletaRouter.patch('/:liveId', requireUser, async (req, res) => {
  const empresaId = await empresaIdDaLive(req.params.liveId).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { ativa, itens } = req.body;
  const supabase = getSupabase();

  if (typeof ativa === 'boolean') {
    const { error } = await supabase
      .from('roletas')
      .upsert({ live_id: req.params.liveId, ativa, atualizado_em: new Date().toISOString() });
    if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  } else {
    // Garante que a linha existe mesmo se só "itens" foi mandado dessa vez.
    await supabase.from('roletas').upsert({ live_id: req.params.liveId }, { onConflict: 'live_id', ignoreDuplicates: true });
  }

  if (Array.isArray(itens)) {
    for (const item of itens) {
      if (!TIPOS_VALIDOS.includes(item.tipo)) {
        return res.status(400).json({ error: 'tipo_invalido', message: `tipo deve ser um de: ${TIPOS_VALIDOS.join(', ')}` });
      }
      if (!(Number(item.peso) > 0)) {
        return res.status(400).json({ error: 'peso_invalido', message: 'peso deve ser maior que zero' });
      }
    }

    const { error: erroDelete } = await supabase.from('roleta_itens').delete().eq('live_id', req.params.liveId);
    if (erroDelete) return res.status(500).json({ error: 'update_failed', message: erroDelete.message });

    if (itens.length > 0) {
      const { error: erroInsert } = await supabase.from('roleta_itens').insert(
        itens.map((item, indice) => ({
          live_id: req.params.liveId,
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
      if (erroInsert) return res.status(500).json({ error: 'update_failed', message: erroInsert.message });
    }
  }

  const { data: roleta } = await supabase.from('roletas').select().eq('live_id', req.params.liveId).single();
  const { data: itensSalvos } = await supabase.from('roleta_itens').select().eq('live_id', req.params.liveId).order('ordem');
  res.json({ ...roleta, itens: itensSalvos ?? [] });
});

// Pública — o espectador gira sem login. session_id vem do front (gerado e
// guardado no localStorage de quem assiste, 1 vez por navegador); o IP é
// capturado aqui, não confia em nada que o client mande sobre isso.
roletaRouter.post('/:liveId/girar', async (req, res) => {
  const { session_id } = req.body;
  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'session_id_obrigatorio' });
  }
  const ip = obterIp(req);
  const supabase = getSupabase();

  const { data: roleta, error: erroRoleta } = await supabase
    .from('roletas')
    .select()
    .eq('live_id', req.params.liveId)
    .single();
  if (erroRoleta) return res.status(404).json({ error: 'roleta_nao_encontrada' });
  if (!roleta.ativa) return res.status(400).json({ error: 'roleta_inativa' });

  // Já girou nessa sessão ou desse IP nessa live? Devolve o resultado de
  // antes em vez de só bloquear, pra pessoa entender o que já ganhou.
  const [porSessao, porIp] = await Promise.all([
    supabase.from('roleta_giros').select('roleta_item_id').eq('live_id', req.params.liveId).eq('session_id', session_id).maybeSingle(),
    supabase.from('roleta_giros').select('roleta_item_id').eq('live_id', req.params.liveId).eq('ip', ip).limit(1).maybeSingle(),
  ]);
  const giroExistente = porSessao.data ?? porIp.data;

  if (giroExistente) {
    const { data: itemAnterior } = await supabase.from('roleta_itens').select().eq('id', giroExistente.roleta_item_id).single();
    return res.status(409).json({ error: 'ja_girou', item: itemAnterior ?? null });
  }

  const { data: itens, error: erroItens } = await supabase.from('roleta_itens').select().eq('live_id', req.params.liveId);
  if (erroItens) return res.status(500).json({ error: 'query_failed', message: erroItens.message });
  if (!itens || itens.length === 0) return res.status(400).json({ error: 'roleta_sem_itens' });

  const vencedor = sortearItem(itens);

  const { error: erroInsert } = await supabase
    .from('roleta_giros')
    .insert({ live_id: req.params.liveId, session_id, ip, roleta_item_id: vencedor.id });
  if (erroInsert) {
    if (erroInsert.code === '23505') return res.status(409).json({ error: 'ja_girou' });
    return res.status(500).json({ error: 'insert_failed', message: erroInsert.message });
  }

  res.json({ item: vencedor });
});
