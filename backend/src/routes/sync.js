import { Router } from 'express';
import { lookupProduto } from '../services/magazord.js';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaIdDaLive, usuarioPertenceAEmpresa, descontoPixDaEmpresa } from '../services/tenancy.js';

export const syncRouter = Router();
syncRouter.use(requireUser);

// Revalida preço/estoque dos produtos ativos de uma live direto na Magazord
// e grava o snapshot atualizado no Supabase (o Realtime propaga pros viewers).
syncRouter.post('/live/:liveId', async (req, res) => {
  const { liveId } = req.params;

  const empresaId = await empresaIdDaLive(liveId).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();

  // Sem isso, o preço recalculado aqui vinha sem o desconto de Pix (sempre
  // 0%) — cada "revalidar preço/estoque" derrubava o preço de Pix de volta
  // pro preço de cartão cheio (achado comparando o histórico de verdade no
  // banco).
  const descontoPix = await descontoPixDaEmpresa(empresaId);

  const { data: produtos, error } = await supabase
    .from('live_products')
    .select('id, produto_codigo')
    .eq('live_id', liveId)
    .eq('ativo', true);

  if (error) return res.status(500).json({ error: 'supabase_query_failed', message: error.message });

  const resultados = await Promise.allSettled(
    produtos.map(async (p) => {
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
  res.json({ sincronizados: resultados.length - falhas.length, falhas: falhas.length });
});
