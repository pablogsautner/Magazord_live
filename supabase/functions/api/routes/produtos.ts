import { Hono } from 'npm:hono@4';
import { lookupProduto, buscarProdutosPorNome } from '../services/magazord.ts';
import { requireUser } from '../middleware/requireUser.ts';

export const produtosRouter = new Hono();
produtosRouter.use('*', requireUser);

produtosRouter.get('/buscar', async (c) => {
  const nome = c.req.query('nome')?.trim();
  if (!nome || nome.length < 3) return c.json([]);
  try {
    const opcoes = await buscarProdutosPorNome(nome);
    return c.json(opcoes);
  } catch (err) {
    return c.json({ error: 'magazord_busca_failed', message: (err as Error).message }, 502);
  }
});

produtosRouter.get('/:codigo', async (c) => {
  try {
    const produto = await lookupProduto(c.req.param('codigo'));
    return c.json(produto);
  } catch (err) {
    return c.json({ error: 'magazord_lookup_failed', message: (err as Error).message }, 502);
  }
});
