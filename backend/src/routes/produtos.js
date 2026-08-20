import { Router } from 'express';
import { lookupProduto } from '../services/magazord.js';
import { adminAuth } from '../middleware/adminAuth.js';

export const produtosRouter = Router();

// Usado pelo admin pra buscar/conferir um produto pelo código antes de adicionar na live.
produtosRouter.get('/:codigo', adminAuth, async (req, res) => {
  try {
    const produto = await lookupProduto(req.params.codigo);
    res.json(produto);
  } catch (err) {
    res.status(502).json({ error: 'magazord_lookup_failed', message: err.message });
  }
});
