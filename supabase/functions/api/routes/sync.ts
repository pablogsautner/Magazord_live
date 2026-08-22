import { Hono } from 'npm:hono@4';
import { lookupProduto } from '../services/magazord.ts';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const syncRouter = new Hono();
syncRouter.use('*', requireUser);

syncRouter.post('/live/:liveId', async (c) => {
  const liveId = c.req.param('liveId');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(liveId).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { data: produtos, error } = await supabase
    .from('live_products')
    .select('id, produto_codigo')
    .eq('live_id', liveId)
    .eq('ativo', true);

  if (error) return c.json({ error: 'supabase_query_failed', message: error.message }, 500);

  const resultados = await Promise.allSettled(
    (produtos as any[]).map(async (p) => {
      const atual = await lookupProduto(p.produto_codigo);
      const { error: updateError } = await supabase
        .from('live_products')
        .update({
          nome: atual.nome,
          imagem_url: atual.imagem_url,
          preco: atual.preco,
          estoque: atual.estoque,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', p.id);
      if (updateError) throw updateError;
      return p.produto_codigo;
    })
  );

  const falhas = resultados.filter((r) => r.status === 'rejected');
  return c.json({ sincronizados: resultados.length - falhas.length, falhas: falhas.length });
});
