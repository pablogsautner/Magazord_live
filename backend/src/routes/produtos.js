import { Router } from 'express';
import { lookupProduto, buscarProdutosPorNome } from '../services/magazord.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario } from '../services/tenancy.js';
import { getSupabase } from '../services/supabase.js';

export const produtosRouter = Router();
produtosRouter.use(requireUser);

async function descontoPixDoUsuario(userId) {
  const empresaId = await empresaUnicaDoUsuario(userId);
  if (!empresaId) return 0;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('empresa_configuracoes')
    .select('desconto_pix_percentual')
    .eq('empresa_id', empresaId)
    .single();
  return data?.desconto_pix_percentual ?? 0;
}

// Autocomplete por nome, usado enquanto o admin digita no campo de busca.
produtosRouter.get('/buscar', async (req, res) => {
  const nome = req.query.nome?.trim();
  if (!nome || nome.length < 3) return res.json([]);
  try {
    const opcoes = await buscarProdutosPorNome(nome);
    res.json(opcoes);
  } catch (err) {
    res.status(502).json({ error: 'magazord_busca_failed', message: err.message });
  }
});

// Usado pelo admin pra buscar/conferir um produto pelo código antes de adicionar na live.
produtosRouter.get('/:codigo', async (req, res) => {
  try {
    const desconto = await descontoPixDoUsuario(req.user.id);
    const produto = await lookupProduto(req.params.codigo, desconto);
    res.json(produto);
  } catch (err) {
    res.status(502).json({ error: 'magazord_lookup_failed', message: err.message });
  }
});
