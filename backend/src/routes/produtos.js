import { Router } from 'express';
import { lookupProduto, buscarProdutosPorNome, getDerivacoes, getMidiasDerivacao } from '../services/magazord.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario } from '../services/tenancy.js';
import { getSupabase } from '../services/supabase.js';

export const produtosRouter = Router();

// ─── Rotas PÚBLICAS ──────────────────────────────────────────────────────────
// O player da live (espectador anônimo) mostra o seletor de cor/tamanho e as
// fotos por cor do produto. Ficam ANTES do requireUser — mesmo padrão de
// GET /lives/:id/audiencia. Não expõem nada sensível (é a mesma info da página
// pública da loja), e o serviço tem cache curto (1 min) pra aguentar muita
// gente na mesma live abrindo o mesmo produto — ver services/magazord.js.

// Seletor de variação da página de produto (cor/tamanho/etc.) — do feed da
// vitrine da Magazord. Aceita qualquer derivação, resolve o pai por dentro.
// `?completo=1` agrega preço/estoque/foto por cor (do mesmo feed, sem chamada
// extra). Ver getDerivacoes em services/magazord.js pro contrato de resposta.
produtosRouter.get('/:codigo/derivacoes', async (req, res) => {
  try {
    res.json(await getDerivacoes(req.params.codigo, { completo: req.query.completo === '1' }));
  } catch (err) {
    res.status(502).json({ error: 'magazord_derivacoes_failed', message: err.message });
  }
});

// Mídias (fotos/vídeos) só da derivação informada — buscadas sob demanda
// quando o espectador escolhe uma cor, pra trocar a foto grande do produto.
produtosRouter.get('/:codigo/midia', async (req, res) => {
  try {
    res.json(await getMidiasDerivacao(req.params.codigo));
  } catch (err) {
    res.status(502).json({ error: 'magazord_midia_failed', message: err.message });
  }
});

// ─── Daqui pra baixo: exige login (uso do painel/admin) ──────────────────────
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

// Espalha caracteristicas.dimensoes em colunas soltas pra montar a linha de
// produto_caracteristicas — dimensoes vem como um objeto só na Magazord.
function linhaCaracteristicas(codigo, caracteristicas) {
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

// Usado pelo admin pra buscar/conferir um produto pelo código antes de adicionar na live.
// Toda vez que isso roda, também atualiza produto_caracteristicas (ficha
// técnica/descrição) — é o único ponto por onde um produto passa antes de
// entrar numa live, então é o gancho natural pra manter essa tabela em dia
// sem precisar de job/infra de sincronização à parte.
produtosRouter.get('/:codigo', async (req, res) => {
  try {
    const desconto = await descontoPixDoUsuario(req.user.id);
    const { caracteristicas, ...produto } = await lookupProduto(req.params.codigo, desconto);

    // Best-effort: se o upsert falhar, não deve derrubar a resposta do
    // lookup (o admin está esperando o preço/estoque, não a ficha técnica).
    getSupabase()
      .from('produto_caracteristicas')
      .upsert(linhaCaracteristicas(req.params.codigo, caracteristicas))
      .then(({ error }) => {
        if (error) console.error('upsert produto_caracteristicas falhou:', error.message);
      });

    res.json(produto);
  } catch (err) {
    res.status(502).json({ error: 'magazord_lookup_failed', message: err.message });
  }
});
