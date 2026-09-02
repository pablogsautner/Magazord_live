import { Router } from 'express';
import { lookupProduto, buscarProdutosPorNome, getDerivacoes } from '../services/magazord.js';
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

// Lista as derivações do mesmo produto pai (não é sempre "cor" — depende do
// produto, pode ser modelo/tamanho/etc.) — útil pra tela de produto mostrar
// um seletor de variação. Aceita qualquer derivação do produto, não precisa
// já saber o código do pai.
produtosRouter.get('/:codigo/derivacoes', async (req, res) => {
  try {
    res.json(await getDerivacoes(req.params.codigo));
  } catch (err) {
    res.status(502).json({ error: 'magazord_derivacoes_failed', message: err.message });
  }
});
