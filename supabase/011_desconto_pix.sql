-- A Magazord não expõe pela API o desconto de Pix configurado no checkout
-- da loja (testei GET /v2/site/configuracaoPagamento e /v2/site/forma-
-- recebimento — nenhum dos dois retorna isso; é config só do tema/checkout
-- deles, "6% de desconto no Pix" só aparece renderizado no site). Por isso
-- vira um campo manual por empresa: cada uma cadastra o % que já usa no
-- checkout real, e o backend aplica isso em cima do preço de cartão que a
-- API de fato retorna, pra mostrar o preço de Pix na live.

alter table empresa_configuracoes
  add column desconto_pix_percentual numeric not null default 0
    check (desconto_pix_percentual >= 0 and desconto_pix_percentual <= 100);
