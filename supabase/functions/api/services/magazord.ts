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

// Lista as derivações do mesmo produto pai — não necessariamente "cores" (o
// nome genérico da Magazord é "derivação" mesmo: pode ser cor, tamanho,
// modelo etc. dependendo do produto). Recebe QUALQUER derivação do produto
// (não precisa já saber o código do pai) e resolve por dentro, igual
// getEstoqueUnificado já faz.
export async function getDerivacoes(codigoDerivacao: string) {
  const detalhe = await getDetalhe(codigoDerivacao);
  const { data } = await magazordGet(`/v2/site/produto?codigo=${encodeURIComponent(detalhe.codigoProduto)}`);
  const derivacoes = data.items[0]?.derivacoes ?? [];
  return derivacoes.map((d: any) => ({ codigo: d.codigo, nome: d.nome, ativo: d.ativo }));
}

async function getPreco(codigoDerivacao: string) {
  const { data } = await magazordGet(
    `/v1/listPreco?produto=${encodeURIComponent(codigoDerivacao)}&tabelaPreco=${config.magazord.tabelaPrecoId}`
  );
  return data[0] ?? null;
}

async function getLink(codigoDerivacao: string) {
  const { data } = await magazordGet(
    `/v2/site/frontend/produto/${config.magazord.lojaId}/${encodeURIComponent(codigoDerivacao)}`
  );
  return data.link;
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

  const imagemPrincipal = detalhe.imagens?.find((img: any) => img.principal) ?? detalhe.imagens?.[0];
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
