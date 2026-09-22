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

  // Sem isso, o preço recalculado aqui vinha sem o desconto de Pix (sempre
  // 0%) — cada "revalidar preço/estoque" derrubava o preço de Pix de volta
  // pro preço de cartão cheio (achado comparando o histórico de verdade no
  // banco). Mesma consulta que produtos.ts já faz.
  const { data: configEmpresa } = await supabase
    .from('empresa_configuracoes')
    .select('desconto_pix_percentual')
    .eq('empresa_id', empresaId)
    .single();
  const descontoPix = (configEmpresa as { desconto_pix_percentual?: number } | null)?.desconto_pix_percentual ?? 0;

  const { data: produtos, error } = await supabase
    .from('live_products')
    .select('id, produto_codigo')
    .eq('live_id', liveId)
    .eq('ativo', true);

  if (error) return c.json({ error: 'supabase_query_failed', message: error.message }, 500);

  const resultados = await Promise.allSettled(
    (produtos as any[]).map(async (p) => {
      const atual = await lookupProduto(p.produto_codigo, descontoPix);
      const { error: updateError } = await supabase
        .from('live_products')
        .update({
          nome: atual.nome,
          imagem_url: atual.imagem_url,
          preco: atual.preco,
          preco_cartao: atual.preco_cartao,
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
