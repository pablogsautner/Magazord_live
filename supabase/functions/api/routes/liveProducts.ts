import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaIdDaLive, empresaIdDoLiveProduct, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const liveProductsRouter = new Hono();
liveProductsRouter.use('*', requireUser);

liveProductsRouter.post('/', async (c) => {
  const user = c.get('user') as { id: string };
  const { live_id, ...produto } = await c.req.json();
  if (!live_id || !produto.produto_codigo || !produto.url_produto) {
    return c.json({ error: 'campos_obrigatorios_faltando' }, 400);
  }

  const empresaId = await empresaIdDaLive(live_id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { count } = await supabase
    .from('live_products')
    .select('id', { count: 'exact', head: true })
    .eq('live_id', live_id);

  const { data, error } = await supabase
    .from('live_products')
    .insert({ ...produto, live_id, ordem: count ?? 0 })
    .select()
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);
  return c.json(data, 201);
});

liveProductsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDoLiveProduct(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'produto_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json();
  const campos: Record<string, boolean> = {};
  if (typeof body.ativo === 'boolean') campos.ativo = body.ativo;
  if (typeof body.destaque === 'boolean') campos.destaque = body.destaque;
  if (Object.keys(campos).length === 0) {
    return c.json({ error: 'nenhum_campo_valido', message: 'Só ativo/destaque podem ser alterados aqui' }, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from('live_products').update(campos).eq('id', id).select().single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
});

liveProductsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDoLiveProduct(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'produto_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('live_products').delete().eq('id', id);
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});

liveProductsRouter.post('/:id/mover', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };
  const { direcao } = await c.req.json();
  if (direcao !== 1 && direcao !== -1) {
    return c.json({ error: 'direcao_invalida', message: 'direcao deve ser 1 ou -1' }, 400);
  }

  const empresaId = await empresaIdDoLiveProduct(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'produto_nao_encontrado' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();

  const { data: alvo, error: erroAlvo } = await supabase
    .from('live_products')
    .select('id, live_id, ordem')
    .eq('id', id)
    .single();
  if (erroAlvo) return c.json({ error: 'produto_nao_encontrado', message: erroAlvo.message }, 404);

  const { data: irmaos, error: erroIrmaos } = await supabase
    .from('live_products')
    .select('id, ordem')
    .eq('live_id', (alvo as any).live_id)
    .order('ordem');
  if (erroIrmaos) return c.json({ error: 'query_failed', message: erroIrmaos.message }, 500);

  const lista = irmaos as any[];
  const idx = lista.findIndex((p) => p.id === (alvo as any).id);
  const idxVizinho = idx + direcao;
  if (idxVizinho < 0 || idxVizinho >= lista.length) return c.body(null, 204);

  const vizinho = lista[idxVizinho];
  const ordemAlvo = vizinho.ordem;
  const ordemVizinho = (alvo as any).ordem;

  const [{ error: erroA }, { error: erroB }] = await Promise.all([
    supabase.from('live_products').update({ ordem: ordemAlvo }).eq('id', (alvo as any).id),
    supabase.from('live_products').update({ ordem: ordemVizinho }).eq('id', vizinho.id),
  ]);
  if (erroA || erroB) {
    return c.json({ error: 'update_failed', message: (erroA ?? erroB)!.message }, 500);
  }

  return c.json({ ok: true });
});
