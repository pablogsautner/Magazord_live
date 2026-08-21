import { Router } from 'express';
import { lookupProduto, buscarProdutosPorNome } from '../services/magazord.js';
import { requireUser } from '../middleware/requireUser.js';

export const produtosRouter = Router();
produtosRouter.use(requireUser);

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
    const produto = await lookupProduto(req.params.codigo);
    res.json(produto);
  } catch (err) {
    res.status(502).json({ error: 'magazord_lookup_failed', message: err.message });
  }
});
