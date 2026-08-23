import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { criarCupomDesconto, atualizarCupomDesconto } from '../services/magazord.ts';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const cuponsRouter = new Hono();
cuponsRouter.use('*', requireUser);

const TIPOS_DESCONTO_VALIDOS = ['percentual', 'fixo'];

async function empresaIdDoCupom(cupomId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cupons')
    .select('live_id, lives(empresa_id)')
    .eq('id', cupomId)
    .single();
  if (error) throw error;
  return (data.lives as any).empresa_id;
}

cuponsRouter.post('/', async (c) => {
  const user = c.get('user') as { id: string };
  const { live_id, codigo, descricao, tipo_desconto, valor_desconto, valido_de, valido_ate, valor_minimo_pedido } =
    await c.req.json();

  if (!live_id || !codigo || !tipo_desconto || valor_desconto === undefined || !valido_de || !valido_ate) {
    return c.json({ error: 'campos_obrigatorios_faltando' }, 400);
  }
  if (!TIPOS_DESCONTO_VALIDOS.includes(tipo_desconto)) {
    return c.json(
      { error: 'tipo_desconto_invalido', message: `tipo_desconto deve ser um de: ${TIPOS_DESCONTO_VALIDOS.join(', ')}` },
      400
    );
  }

  const empresaId = await empresaIdDaLive(live_id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  let cupomMagazord: any;
  try {
    cupomMagazord = await criarCupomDesconto({
      codigo,
      descricao,
      tipoDesconto: tipo_desconto,
      valorDesconto: valor_desconto,
      validoDe: valido_de,
      validoAte: valido_ate,
      valorMinimoPedido: valor_minimo_pedido,
    });
  } catch (err) {
    return c.json({ error: 'magazord_criar_cupom_failed', message: (err as Error).message }, 502);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('cupons')
    .insert({
      live_id,
      magazord_cupom_id: cupomMagazord?.id ?? null,
      codigo,
      descricao,
      tipo_desconto,
      valor_desconto,
      valido_de,
      valido_ate,
      valor_minimo_pedido,
    })
    .select()
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);
  return c.json(data, 201);
});

cuponsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDoCupom(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'cupom_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { data: cupom, error: erroCupom } = await supabase
    .from('cupons')
    .select('magazord_cupom_id')
    .eq('id', id)
    .single();
  if (erroCupom) return c.json({ error: 'cupom_nao_encontrado' }, 404);

  const body = await c.req.json();
  const campos: Record<string, unknown> = {};
  if (typeof body.ativo === 'boolean') campos.ativo = body.ativo;
  if (body.descricao !== undefined) campos.descricao = body.descricao;
  if (body.valido_ate !== undefined) campos.valido_ate = body.valido_ate;
  if (Object.keys(campos).length === 0) {
    return c.json({ error: 'nenhum_campo_valido' }, 400);
  }

  const magazordCupomId = (cupom as any).magazord_cupom_id;
  if (magazordCupomId) {
    const campoMagazord: Record<string, unknown> = {};
    if (campos.ativo !== undefined) campoMagazord.ativo = campos.ativo;
    if (campos.descricao !== undefined) campoMagazord.descricao = campos.descricao;
    if (campos.valido_ate !== undefined) campoMagazord.validoAte = campos.valido_ate;
    try {
      await atualizarCupomDesconto(magazordCupomId, campoMagazord);
    } catch (err) {
      return c.json({ error: 'magazord_atualizar_cupom_failed', message: (err as Error).message }, 502);
    }
  }

  const { data, error } = await supabase.from('cupons').update(campos).eq('id', id).select().single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
});

// A Magazord não tem endpoint de excluir cupom — "remover" aqui é desativar
// nos dois lados (lá e no nosso registro), igual já fazemos com produto/live.
cuponsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDoCupom(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'cupom_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { data: cupom, error: erroCupom } = await supabase
    .from('cupons')
    .select('magazord_cupom_id')
    .eq('id', id)
    .single();
  if (erroCupom) return c.json({ error: 'cupom_nao_encontrado' }, 404);

  const magazordCupomId = (cupom as any).magazord_cupom_id;
  if (magazordCupomId) {
    try {
      await atualizarCupomDesconto(magazordCupomId, { ativo: false });
    } catch (err) {
      return c.json({ error: 'magazord_desativar_cupom_failed', message: (err as Error).message }, 502);
    }
  }

  const { error } = await supabase.from('cupons').update({ ativo: false }).eq('id', id);
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.body(null, 204);
});
