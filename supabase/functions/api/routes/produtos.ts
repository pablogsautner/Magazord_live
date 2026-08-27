import { Hono } from 'npm:hono@4';
import { lookupProduto, buscarProdutosPorNome } from '../services/magazord.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaUnicaDoUsuario } from '../services/tenancy.ts';
import { getSupabase } from '../services/supabase.ts';

export const produtosRouter = new Hono();
produtosRouter.use('*', requireUser);

async function descontoPixDoUsuario(userId: string) {
  const empresaId = await empresaUnicaDoUsuario(userId);
  if (!empresaId) return 0;
  const supabase = getSupabase();
  const { data } = await supabase
    .from('empresa_configuracoes')
    .select('desconto_pix_percentual')
    .eq('empresa_id', empresaId)
    .single();
  return (data as any)?.desconto_pix_percentual ?? 0;
}

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
  const user = c.get('user') as { id: string };
  try {
    const desconto = await descontoPixDoUsuario(user.id);
    const produto = await lookupProduto(c.req.param('codigo'), desconto);
    return c.json(produto);
  } catch (err) {
    return c.json({ error: 'magazord_lookup_failed', message: (err as Error).message }, 502);
  }
});
