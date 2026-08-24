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

async function getPreco(codigoDerivacao) {
  const { data } = await magazordGet(
    `/v1/listPreco?produto=${encodeURIComponent(codigoDerivacao)}&tabelaPreco=${config.magazord.tabelaPrecoId}`
  );
  return data[0] ?? null;
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
    for (const derivacao of produto.derivacoes ?? []) {
      if (!derivacao.ativo) continue;
      opcoes.push({ codigo: derivacao.codigo, nome: derivacao.nome });
      if (opcoes.length >= limite) return opcoes;
    }
  }
  return opcoes;
}

export async function lookupProduto(codigoDerivacao) {
  const [detalhe, estoque, precoInfo, link] = await Promise.all([
    getDetalhe(codigoDerivacao),
    getEstoque(codigoDerivacao),
    getPreco(codigoDerivacao),
    getLink(codigoDerivacao),
  ]);

  const imagemPrincipal = detalhe.imagens?.find((img) => img.principal) ?? detalhe.imagens?.[0];

  return {
    produto_codigo: codigoDerivacao,
    nome: detalhe.nomeProduto,
    imagem_url: imagemPrincipal?.url ?? null,
    preco: precoInfo ? Number(precoInfo.precoVenda) : null,
    preco_antigo: precoInfo?.precoAntigo ? Number(precoInfo.precoAntigo) : null,
    estoque,
    url_produto: link ? `${config.magazord.storefrontBaseUrl}/${link}` : null,
  };
}

// tipoDesconto na Magazord: 1 = valor fixo (R$), 2 = percentual (%).
function tipoDescontoMagazord(tipoDesconto) {
  return tipoDesconto === 'percentual' ? 2 : 1;
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
    validoDe,
    validoAte,
    valorMinimoPedido,
    loja: Number(config.magazord.lojaId),
  });
  return resposta?.data ?? resposta;
}

export async function atualizarCupomDesconto(magazordCupomId, campos) {
  const resposta = await magazordEnviar('PATCH', `/v2/site/cupomDesconto/${magazordCupomId}`, campos);
  return resposta?.data ?? resposta;
}
