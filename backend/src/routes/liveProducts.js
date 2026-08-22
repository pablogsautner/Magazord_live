import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaIdDaLive, empresaIdDoLiveProduct, usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const liveProductsRouter = Router();
liveProductsRouter.use(requireUser);

liveProductsRouter.post('/', async (req, res) => {
  const { live_id, ...produto } = req.body;
  if (!live_id || !produto.produto_codigo || !produto.url_produto) {
    return res.status(400).json({ error: 'campos_obrigatorios_faltando' });
  }

  const empresaId = await empresaIdDaLive(live_id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
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
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

liveProductsRouter.patch('/:id', async (req, res) => {
  const empresaId = await empresaIdDoLiveProduct(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'produto_nao_encontrado' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const campos = {};
  if (typeof req.body.ativo === 'boolean') campos.ativo = req.body.ativo;
  if (typeof req.body.destaque === 'boolean') campos.destaque = req.body.destaque;
  if (Object.keys(campos).length === 0) {
    return res.status(400).json({ error: 'nenhum_campo_valido', message: 'Só ativo/destaque podem ser alterados aqui' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from('live_products').update(campos).eq('id', req.params.id).select().single();
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
});

liveProductsRouter.delete('/:id', async (req, res) => {
  const empresaId = await empresaIdDoLiveProduct(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'produto_nao_encontrado' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('live_products').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'delete_failed', message: error.message });
  res.status(204).end();
});

// direcao: -1 sobe (fica antes), 1 desce (fica depois) — troca a "ordem" com o vizinho.
liveProductsRouter.post('/:id/mover', async (req, res) => {
  const { direcao } = req.body;
  if (direcao !== 1 && direcao !== -1) {
    return res.status(400).json({ error: 'direcao_invalida', message: 'direcao deve ser 1 ou -1' });
  }

  const empresaId = await empresaIdDoLiveProduct(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'produto_nao_encontrado' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();

  const { data: alvo, error: erroAlvo } = await supabase
    .from('live_products')
    .select('id, live_id, ordem')
    .eq('id', req.params.id)
    .single();
  if (erroAlvo) return res.status(404).json({ error: 'produto_nao_encontrado', message: erroAlvo.message });

  const { data: irmaos, error: erroIrmaos } = await supabase
    .from('live_products')
    .select('id, ordem')
    .eq('live_id', alvo.live_id)
    .order('ordem');
  if (erroIrmaos) return res.status(500).json({ error: 'query_failed', message: erroIrmaos.message });

  const idx = irmaos.findIndex((p) => p.id === alvo.id);
  const idxVizinho = idx + direcao;
  if (idxVizinho < 0 || idxVizinho >= irmaos.length) return res.status(204).end();

  const vizinho = irmaos[idxVizinho];
  const [ordemAlvo, ordemVizinho] = [vizinho.ordem, alvo.ordem];

  const [{ error: erroA }, { error: erroB }] = await Promise.all([
    supabase.from('live_products').update({ ordem: ordemAlvo }).eq('id', alvo.id),
    supabase.from('live_products').update({ ordem: ordemVizinho }).eq('id', vizinho.id),
  ]);
  if (erroA || erroB) {
    return res.status(500).json({ error: 'update_failed', message: (erroA ?? erroB).message });
  }

  res.json({ ok: true });
});
