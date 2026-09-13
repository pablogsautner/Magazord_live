import { config } from '../config.ts';

function authHeader() {
  const token = btoa(`${config.magazord.user}:${config.magazord.password}`);
  return `Basic ${token}`;
}

async function magazordGet(path: string) {
  const res = await fetch(`${config.magazord.baseUrl}${path}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Magazord ${path} -> HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function magazordEnviar(metodo: string, path: string, corpo: unknown) {
  const res = await fetch(`${config.magazord.baseUrl}${path}`, {
    method: metodo,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Magazord ${metodo} ${path} -> HTTP ${res.status}: ${body}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getDetalhe(codigoDerivacao: string) {
  const [detalhe] = await magazordGet(`/v3/produtos/derivacao/${encodeURIComponent(codigoDerivacao)}/detail`);
  return detalhe;
}

// Feed da vitrine — MESMA fonte que a página de produto da Magazord usa pra
// renderizar. Só aceita CÓDIGO DE DERIVAÇÃO (não o código cru do produto pai —
// esse dá 404 em produtos do tipo "Cor - Exibe Filhos"). Num JSON só:
// `derivacao_nome` (limpo), `derivacao_codigo_pai`, `valor`/`valor_de`/
// `percentual_desconto`, `qtde_estoque`, `midias[]` (com `nivel_relacionamento`
// 1=foto da cor, 2=genérica), `caracteristicas[]`, e `derivacoes_produto[0]`
// (o(s) eixo(s) dessa derivação). getLink já batia aqui só pra pegar o `.link`.
async function magazordFrontend(codigo: string) {
  const { data } = await magazordGet(
    `/v2/site/frontend/produto/${config.magazord.lojaId}/${encodeURIComponent(codigo)}`
  );
  return data;
}

let cdnBaseCache: string | null = null;
// Host do CDN pra montar URL absoluta — o feed da vitrine e a rota de mídia
// devolvem caminho relativo ("img/2022/.../x.jpg"). Vem de /v2/site/loja
// (campo urlImagem). Config de loja é estática: resolve uma vez e cacheia.
async function getCdnBase() {
  if (cdnBaseCache) return cdnBaseCache;
  const { data } = await magazordGet('/v2/site/loja');
  const loja = data.items.find((l: any) => String(l.id) === String(config.magazord.lojaId)) ?? data.items[0];
  cdnBaseCache = (loja?.urlImagem || '').replace(/\/+$/, '');
  return cdnBaseCache;
}

// Cache curto (1 min) pras rotas de derivação/mídia — elas são PÚBLICAS (o
// player anônimo da live consome). Numa live cheia vários espectadores abrem
// o mesmo produto quase juntos; sem isso, cada um dispara 2+N chamadas à
// Magazord pro mesmo dado. TTL curto porque preço/estoque mudam durante a live.
//
// emVooStore evita "cache stampede": sem isso, N requisições concorrentes com
// cache frio/vencido disparavam N buscas idênticas em paralelo (cada uma só
// enxergava o cache ainda vazio). Agora a 1ª chamada guarda a PROMISE em
// andamento, e quem chega atrás espera essa mesma promise em vez de repetir o
// fan-out — só 1 busca de verdade por chave, não importa quantos concorrentes.
const cacheCurtoStore = new Map<string, { ts: number; valor: unknown }>();
const emVooStore = new Map<string, Promise<unknown>>();
function cacheCurto<T>(chave: string, produzir: () => Promise<T>, ttlMs = 60_000): Promise<T> {
  const hit = cacheCurtoStore.get(chave);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.valor as T);

  const emVoo = emVooStore.get(chave) as Promise<T> | undefined;
  if (emVoo) return emVoo;

  const promessa = Promise.resolve(produzir())
    .then((valor) => {
      cacheCurtoStore.set(chave, { ts: Date.now(), valor });
      return valor;
    })
    .finally(() => emVooStore.delete(chave)); // erro não fica em cache — próxima chamada tenta de novo
  emVooStore.set(chave, promessa);
  return promessa;
}

async function getEstoque(codigoDerivacao: string) {
  const { data } = await magazordGet(`/v1/listEstoque?produto=${encodeURIComponent(codigoDerivacao)}`);
  return data.reduce((total: number, deposito: any) => total + (deposito.quantidadeDisponivelVenda || 0), 0);
}

// Cada cor é uma derivação com estoque próprio (ex: Branco tem 465, Azul tem
// 535 — não é um estoque único compartilhado pelo produto pai). Pra mostrar
// "quanto tem desse produto" de forma unificada (sem prender a live numa cor
// específica), soma o estoque de todas as derivações ativas do mesmo pai.
async function getEstoqueUnificado(codigoProduto: string, codigoDerivacaoOriginal: string) {
  const { data } = await magazordGet(`/v2/site/produto?codigo=${encodeURIComponent(codigoProduto)}`);
  const derivacoesAtivas = (data.items[0]?.derivacoes ?? []).filter((derivacao: any) => derivacao.ativo);
  if (derivacoesAtivas.length === 0) return getEstoque(codigoDerivacaoOriginal);

  const estoques = await Promise.all(derivacoesAtivas.map((derivacao: any) => getEstoque(derivacao.codigo)));
  return estoques.reduce((total: number, estoque: number) => total + estoque, 0);
}

// Fallback pro nome limpo da derivação quando o feed da vitrine não responde:
// tira o nome do pai como prefixo do nome cheio do filho ("<pai> - <valor>").
// Se o prefixo não bater, pega o último trecho depois de " - "; senão, o cheio.
function valorLimpo(nomeFilho: string, nomePai: string | null): string | null {
  const filho = (nomeFilho || '').trim();
  const pai = (nomePai || '').trim();
  if (pai && filho.startsWith(pai)) {
    const resto = filho.slice(pai.length).replace(/^\s*[-–—]\s*/, '').trim();
    if (resto) return resto;
  }
  const partes = filho.split(/\s+[-–—]\s+/);
  return partes.length > 1 ? partes[partes.length - 1].trim() : filho || null;
}

/**
 * Derivações (variações) do mesmo produto pai, no formato que a PÁGINA DE
 * PRODUTO da Magazord usa pra montar o seletor de variação.
 *
 * `/v2/site/produto?codigo=<pai>` dá o roster de irmãs (id/codigo/nome/ativo) —
 * funciona pros dois tipos de eixo ("Exibe Pai" e "Exibe Filhos"). Pra cada
 * irmã ATIVA, o feed da vitrine (/v2/site/frontend/produto/<lojaId>/<codigo>)
 * dá o nome limpo ("Amarelo Claro") e o(s) eixo(s) ("Cor"/"Tamanho") —
 * `derivacoes_produto` é ARRAY, 1 entrada por eixo. Neste catálogo é sempre
 * "Cor" (tamanho é produto pai separado), mas tratamos como N eixos.
 *
 * completo=true extrai também preço/estoque/foto do MESMO feed (sem chamada
 * extra). Custo: 2 + N chamadas (N = derivações ativas), em paralelo; passa
 * por cacheCurto (1 min) porque a rota é pública. Só derivações ativas entram.
 *
 * Retorno:
 *   Derivacao        = { codigo, nome, ativo, variacoes: {eixo,valor}[], swatch_url }
 *   DerivacaoCompleta = Derivacao & { preco, preco_antigo, desconto_percentual, estoque, imagem_url }
 */
export function getDerivacoes(codigoDerivacao: string, { completo = false }: { completo?: boolean } = {}) {
  return cacheCurto(`deriv|${codigoDerivacao}|${completo ? 'c' : ''}`, () =>
    buscarDerivacoes(codigoDerivacao, completo)
  );
}

// Normaliza o array "midias" do feed da vitrine (mesmo formato pra qualquer
// derivação): junta a(s) foto(s) ESPECÍFICA(S) daquela cor (nivel_relacionamento
// 1) com as GENÉRICAS do produto pai (nivel_relacionamento 2, ex: fotos de
// "qualidade"/textura, sem cor nenhuma) — específica primeiro. Usado tanto por
// getDerivacoes (completo=true, só pega a primeira pra imagem_url) quanto por
// getMidiasDerivacao (galeria completa).
function mapMidias(midias: any[] | undefined, cdn: string | null) {
  return (midias ?? [])
    .map((m: any) => ({
      url: `${cdn}/${m.path}${m.arquivo_nome}`,
      especifica: m.nivel_relacionamento === 1, // true = só dessa cor; false = genérica do pai
      ordem: m.ordem ?? 0,
      alt: m.alt || null,
      tipo: m.tipo_file, // 1 = imagem
    }))
    .sort((a: any, b: any) => Number(b.especifica) - Number(a.especifica) || a.ordem - b.ordem);
}

async function buscarDerivacoes(codigoDerivacao: string, completo: boolean) {
  const detalhe = await getDetalhe(codigoDerivacao);
  if (!detalhe?.codigoProduto) throw new Error(`Derivação ${codigoDerivacao} não encontrada na Magazord`);
  const [prod, cdn] = await Promise.all([
    magazordGet(`/v2/site/produto?codigo=${encodeURIComponent(detalhe.codigoProduto)}`),
    getCdnBase(),
  ]);
  const nomePai = prod.data.items[0]?.nome ?? null;
  const irmas = (prod.data.items[0]?.derivacoes ?? []).filter((d: any) => d.ativo);

  return Promise.all(
    irmas.map(async (irma: any) => {
      const feed = await magazordFrontend(irma.codigo).catch(() => null);

      // No feed chamado POR DERIVAÇÃO, `derivacoes_produto` é a lista chapada
      // dos eixos dessa derivação (1 item por eixo) — não a lista de irmãs.
      const variacoes = (feed?.derivacoes_produto ?? [])
        .slice()
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .map((e: any) => ({ eixo: e.deri_nome ?? null, valor: e.derivacao ?? null }));
      const chip = feed?.derivacoes_produto?.[0];

      const item: any = {
        codigo: irma.codigo,
        nome: feed?.derivacao_nome ?? valorLimpo(irma.nome, nomePai),
        ativo: irma.ativo,
        variacoes: variacoes.length
          ? variacoes
          : [{ eixo: null, valor: feed?.derivacao_nome ?? valorLimpo(irma.nome, nomePai) }],
        swatch_url: chip?.midia_path ? `${cdn}/${chip.midia_path}${chip.midia_arquivo_nome}` : null,
      };
      if (!completo) return item;

      // Primeira mídia (específica da cor se tiver; senão já cai pra genérica
      // do pai — mapMidias já ordena assim).
      const capa = mapMidias(feed?.midias, cdn)[0];
      return {
        ...item,
        preco: feed?.valor ?? null,
        preco_antigo: feed?.valor_de ?? null,
        desconto_percentual: feed?.percentual_desconto ?? 0,
        estoque: feed?.qtde_estoque ?? null,
        imagem_url: capa?.url ?? null,
      };
    })
  );
}

/**
 * Mídias da derivação — a(s) foto(s) DESSA cor junto com as genéricas do
 * produto pai (mesmas que aparecem na página do produto), específica(s)
 * primeiro. Vem do mesmo feed da vitrine que getDerivacoes(completo=true) usa
 * — 1 chamada só, sem precisar resolver o pai por fora. Buscada sob demanda
 * quando o usuário escolhe a cor no seletor. Rota pública — cacheCurto (1 min).
 * Retorno: { url, especifica, ordem, alt, tipo }[]  (tipo 1 = imagem)
 */
export function getMidiasDerivacao(codigoDerivacao: string) {
  return cacheCurto(`midia|${codigoDerivacao}`, async () => {
    const [feed, cdn] = await Promise.all([magazordFrontend(codigoDerivacao), getCdnBase()]);
    return mapMidias(feed.midias, cdn);
  });
}

async function getPreco(codigoDerivacao: string) {
  const { data } = await magazordGet(
    `/v1/listPreco?produto=${encodeURIComponent(codigoDerivacao)}&tabelaPreco=${config.magazord.tabelaPrecoId}`
  );
  return data[0] ?? null;
}

// Às vezes o cadastro tem MAIS de uma imagem marcada "principal: true" (visto
// em dados reais: sobe uma foto genérica da família do produto marcada
// principal, depois sobe a foto de verdade da cor/derivação TAMBÉM marcada
// principal, sem desmarcar a antiga). A última do array é a mais confiável
// (a mais recente, geralmente a que bate com a derivação específica) — usar
// a primeira (find simples) pega a genérica errada. Sem nenhuma marcada, cai
// pra última imagem da lista pelo mesmo motivo (upload mais recente = fim).
function escolherImagemPrincipal(imagens: any[] = []) {
  for (let i = imagens.length - 1; i >= 0; i--) {
    if (imagens[i].principal) return imagens[i];
  }
  return imagens[imagens.length - 1] ?? null;
}

async function getLink(codigoDerivacao: string) {
  return (await magazordFrontend(codigoDerivacao)).link;
}

export async function buscarProdutosPorNome(nome: string, limite = 15) {
  const { data } = await magazordGet(`/v2/site/produto?nome=${encodeURIComponent(nome)}&limit=30`);

  const opcoes = [];
  for (const produto of data.items) {
    if (!produto.ativo) continue;
    const derivacaoAtiva = (produto.derivacoes ?? []).find(
      (derivacao: any) => derivacao.ativo && !derivacao.nome.toUpperCase().includes('FORA DE COLEÇÃO')
    );
    if (!derivacaoAtiva) continue;
    opcoes.push({ codigo: derivacaoAtiva.codigo, nome: produto.nome });
    if (opcoes.length >= limite) return opcoes;
  }
  return opcoes;
}

// A Magazord só retorna pela API o preço "de cartão" (listPreco) — o desconto
// de Pix não vem em nenhum endpoint (testamos configuracaoPagamento e
// forma-recebimento, nenhum tem isso), é config só do checkout/tema da loja.
// Por isso o % é cadastrado manualmente por empresa e aplicado aqui, pra
// mostrar na live o preço que a pessoa realmente paga pagando no Pix.
export async function lookupProduto(codigoDerivacao: string, descontoPixPercentual = 0) {
  const detalhe = await getDetalhe(codigoDerivacao);

  const [estoque, precoInfo, link] = await Promise.all([
    getEstoqueUnificado(detalhe.codigoProduto, codigoDerivacao),
    getPreco(codigoDerivacao),
    getLink(codigoDerivacao),
  ]);

  const imagemPrincipal = escolherImagemPrincipal(detalhe.imagens);
  const precoCartao = precoInfo ? Number(precoInfo.precoVenda) : null;
  const preco = precoCartao !== null ? Number((precoCartao * (1 - descontoPixPercentual / 100)).toFixed(2)) : null;
  // produtoLoja é um array com um item por loja (mesmo lojaId que getLink já
  // usa) — carrega a descrição rica (HTML) e ficha técnica que a página de
  // produto da própria Magazord usa, e que hoje o detalhe descarta.
  const dadosLoja = detalhe.produtoLoja?.find((p: any) => p.loja === Number(config.magazord.lojaId));

  return {
    produto_codigo: codigoDerivacao,
    nome: detalhe.nomeProduto,
    imagem_url: imagemPrincipal?.url ?? null,
    preco,
    preco_antigo: precoInfo?.precoAntigo ? Number(precoInfo.precoAntigo) : null,
    estoque,
    url_produto: link ? `${config.magazord.storefrontBaseUrl}/${link}` : null,
    caracteristicas: {
      id_produto_magazord: detalhe.idProduto ?? null,
      titulo: dadosLoja?.titulo ?? null,
      descricao: dadosLoja?.descricao ?? null,
      descricao_resumida: dadosLoja?.descricaoResumida ?? null,
      marca: detalhe.marca?.nome ?? null,
      categorias: (detalhe.categorias ?? []).map((c: any) => c.nome),
      ean: detalhe.ean?.[0] ?? null,
      dimensoes: detalhe.dimensoes?.[0] ?? null,
      atributos: detalhe.atributos ?? [],
    },
  };
}

// tipoDesconto na Magazord: 1 = valor fixo (R$), 2 = percentual (%).
function tipoDescontoMagazord(tipoDesconto: string) {
  return tipoDesconto === 'percentual' ? 2 : 1;
}

// A Magazord dá 500 (não um 400 de validação) se a data ISO tiver milissegundos
// — e `Date.toISOString()` do JS sempre inclui ("...T00:00:00.000Z"). Normaliza
// removendo, senão qualquer front que use Date nativo pra montar a data quebra.
function isoSemMilissegundos(data: string) {
  return new Date(data).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function criarCupomDesconto(input: {
  codigo: string;
  descricao?: string;
  tipoDesconto: string;
  valorDesconto: number;
  validoDe: string;
  validoAte: string;
  valorMinimoPedido?: number;
}) {
  const resposta: any = await magazordEnviar('POST', '/v2/site/cupomDesconto', {
    codigo: input.codigo,
    descricao: input.descricao,
    tipoDesconto: tipoDescontoMagazord(input.tipoDesconto),
    // tipoLimite 1 = cupom de uso geral (não amarrado a uma pessoa específica),
    // igual os cupons de campanha (ex: "FEIRAO10") que já existem na conta.
    tipoLimite: 1,
    valorDesconto: input.valorDesconto,
    validoDe: isoSemMilissegundos(input.validoDe),
    validoAte: isoSemMilissegundos(input.validoAte),
    // A Magazord exige um número aqui, não aceita null — "sem mínimo" = 0.
    valorMinimoPedido: input.valorMinimoPedido ?? 0,
    loja: Number(config.magazord.lojaId),
  });
  return resposta?.data ?? resposta;
}

export async function atualizarCupomDesconto(magazordCupomId: number, campos: Record<string, unknown>) {
  if (typeof campos.validoAte === 'string') {
    campos = { ...campos, validoAte: isoSemMilissegundos(campos.validoAte) };
  }
  const resposta: any = await magazordEnviar('PATCH', `/v2/site/cupomDesconto/${magazordCupomId}`, campos);
  return resposta?.data ?? resposta;
}
