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

// Espalha caracteristicas.dimensoes em colunas soltas pra montar a linha de
// produto_caracteristicas — dimensoes vem como um objeto só na Magazord.
function linhaCaracteristicas(codigo: string, caracteristicas: any) {
  const { dimensoes, ...resto } = caracteristicas;
  return {
    produto_codigo: codigo,
    ...resto,
    peso: dimensoes?.peso ?? null,
    largura: dimensoes?.largura ?? null,
    altura: dimensoes?.altura ?? null,
    comprimento: dimensoes?.comprimento ?? null,
    atualizado_em: new Date().toISOString(),
  };
}

// Toda vez que isso roda, também atualiza produto_caracteristicas (ficha
// técnica/descrição) — é o único ponto por onde um produto passa antes de
// entrar numa live, então é o gancho natural pra manter essa tabela em dia
// sem precisar de job/infra de sincronização à parte.
produtosRouter.get('/:codigo', async (c) => {
  const user = c.get('user') as { id: string };
  const codigo = c.req.param('codigo');
  try {
    const desconto = await descontoPixDoUsuario(user.id);
    const { caracteristicas, ...produto } = await lookupProduto(codigo, desconto);

    // Best-effort: se o upsert falhar, não deve derrubar a resposta do
    // lookup (o admin está esperando o preço/estoque, não a ficha técnica).
    getSupabase()
      .from('produto_caracteristicas')
      .upsert(linhaCaracteristicas(codigo, caracteristicas))
      .then(({ error }: any) => {
        if (error) console.error('upsert produto_caracteristicas falhou:', error.message);
      });

    return c.json(produto);
  } catch (err) {
    return c.json({ error: 'magazord_lookup_failed', message: (err as Error).message }, 502);
  }
});
