import { config } from '../config.js';

function authHeader() {
  const token = Buffer.from(`${config.magazord.user}:${config.magazord.password}`).toString('base64');
  return `Basic ${token}`;
}

async function magazordGet(path) {
  const res = await fetch(`${config.magazord.baseUrl}${path}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Magazord ${path} -> HTTP ${res.status}: ${body}`);
  }
  return res.json();
}

async function magazordEnviar(metodo, path, corpo) {
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

async function getDetalhe(codigoDerivacao) {
  const [detalhe] = await magazordGet(`/v3/produtos/derivacao/${encodeURIComponent(codigoDerivacao)}/detail`);
  return detalhe;
}

async function getEstoque(codigoDerivacao) {
  const { data } = await magazordGet(`/v1/listEstoque?produto=${encodeURIComponent(codigoDerivacao)}`);
  return data.reduce((total, deposito) => total + (deposito.quantidadeDisponivelVenda || 0), 0);
}

// Cada cor é uma derivação com estoque próprio (ex: Branco tem 465, Azul tem
// 535 — não é um estoque único compartilhado pelo produto pai). Pra mostrar
// "quanto tem desse produto" de forma unificada (sem prender a live numa cor
// específica), soma o estoque de todas as derivações ativas do mesmo pai.
async function getEstoqueUnificado(codigoProduto, codigoDerivacaoOriginal) {
  const { data } = await magazordGet(`/v2/site/produto?codigo=${encodeURIComponent(codigoProduto)}`);
  const derivacoesAtivas = (data.items[0]?.derivacoes ?? []).filter((derivacao) => derivacao.ativo);
  if (derivacoesAtivas.length === 0) return getEstoque(codigoDerivacaoOriginal);

  const estoques = await Promise.all(derivacoesAtivas.map((derivacao) => getEstoque(derivacao.codigo)));
  return estoques.reduce((total, estoque) => total + estoque, 0);
}

// Lista as derivações do mesmo produto pai — não necessariamente "cores" (o
// nome genérico da Magazord é "derivação" mesmo: pode ser cor, tamanho,
// modelo etc. dependendo do produto). Recebe QUALQUER derivação do produto
// (não precisa já saber o código do pai) e resolve por dentro, igual
// getEstoqueUnificado já faz.
//
// As fotos NÃO vêm de /v2/site/produtoDerivacoes (conferido direto na API
// real: essa lista só tem metadados — peso, EAN, datas — nenhum campo de
// imagem) nem do array "derivacoes" de /v2/site/produto (só tem
// codigo/nome/ativo). Só o /v3/produtos/derivacao/{codigo}/detail (mesmo
// endpoint do getDetalhe/lookupProduto) tem o array "imagens" de verdade —
// por isso busca o detalhe de CADA derivação aqui (1 request a mais por
// derivação; aceitável porque só roda quando alguém abre as opções do
// produto, não em toda listagem). Não busca estoque/preço por derivação:
// estoque é deliberadamente unificado (ver getEstoqueUnificado), e preço
// seria mais uma chamada por derivação sem necessidade nesta tela.
export async function getDerivacoes(codigoDerivacao) {
  const detalhe = await getDetalhe(codigoDerivacao);
  const { data } = await magazordGet(`/v2/site/produto?codigo=${encodeURIComponent(detalhe.codigoProduto)}`);
  const derivacoes = data.items[0]?.derivacoes ?? [];

  const detalhes = await Promise.all(
    derivacoes.map((d) =>
      d.codigo === codigoDerivacao ? detalhe : getDetalhe(d.codigo).catch(() => null)
    )
  );

  return derivacoes.map((d, i) => {
    const det = detalhes[i];
    const imagens = det?.imagens ?? [];
    const imagemPrincipal = escolherImagemPrincipal(imagens);
    return {
      codigo: d.codigo,
      nome: d.nome,
      ativo: d.ativo,
      imagem_url: imagemPrincipal?.url ?? null,
      imagens: imagens.map((img) => img.url),
    };
  });
}

async function getPreco(codigoDerivacao) {
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
function escolherImagemPrincipal(imagens = []) {
  for (let i = imagens.length - 1; i >= 0; i--) {
    if (imagens[i].principal) return imagens[i];
  }
  return imagens[imagens.length - 1] ?? null;
}

async function getLink(codigoDerivacao) {
  const { data } = await magazordGet(
    `/v2/site/frontend/produto/${config.magazord.lojaId}/${encodeURIComponent(codigoDerivacao)}`
  );
  return data.link;
}

export async function buscarProdutosPorNome(nome, limite = 15) {
  const { data } = await magazordGet(`/v2/site/produto?nome=${encodeURIComponent(nome)}&limit=30`);

  const opcoes = [];
  for (const produto of data.items) {
    if (!produto.ativo) continue;
    const derivacaoAtiva = (produto.derivacoes ?? []).find(
      (derivacao) => derivacao.ativo && !derivacao.nome.toUpperCase().includes('FORA DE COLEÇÃO')
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
export async function lookupProduto(codigoDerivacao, descontoPixPercentual = 0) {
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
  const dadosLoja = detalhe.produtoLoja?.find((p) => p.loja === Number(config.magazord.lojaId));

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
      categorias: (detalhe.categorias ?? []).map((c) => c.nome),
      ean: detalhe.ean?.[0] ?? null,
      dimensoes: detalhe.dimensoes?.[0] ?? null,
      atributos: detalhe.atributos ?? [],
    },
  };
}

// tipoDesconto na Magazord: 1 = valor fixo (R$), 2 = percentual (%).
function tipoDescontoMagazord(tipoDesconto) {
  return tipoDesconto === 'percentual' ? 2 : 1;
}

// A Magazord dá 500 (não um 400 de validação) se a data ISO tiver milissegundos
// — e `Date.toISOString()` do JS sempre inclui ("...T00:00:00.000Z"). Normaliza
// removendo, senão qualquer front que use Date nativo pra montar a data quebra.
function isoSemMilissegundos(data) {
  return new Date(data).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function criarCupomDesconto({ codigo, descricao, tipoDesconto, valorDesconto, validoDe, validoAte, valorMinimoPedido }) {
  const resposta = await magazordEnviar('POST', '/v2/site/cupomDesconto', {
    codigo,
    descricao,
    tipoDesconto: tipoDescontoMagazord(tipoDesconto),
    // tipoLimite 1 = cupom de uso geral (não amarrado a uma pessoa específica),
    // igual os cupons de campanha (ex: "FEIRAO10") que já existem na conta.
    tipoLimite: 1,
    valorDesconto,
    validoDe: isoSemMilissegundos(validoDe),
    validoAte: isoSemMilissegundos(validoAte),
    // A Magazord exige um número aqui, não aceita null — "sem mínimo" = 0.
    valorMinimoPedido: valorMinimoPedido ?? 0,
    loja: Number(config.magazord.lojaId),
  });
  return resposta?.data ?? resposta;
}

export async function atualizarCupomDesconto(magazordCupomId, campos) {
  if (campos.validoAte) campos = { ...campos, validoAte: isoSemMilissegundos(campos.validoAte) };
  const resposta = await magazordEnviar('PATCH', `/v2/site/cupomDesconto/${magazordCupomId}`, campos);
  return resposta?.data ?? resposta;
}
