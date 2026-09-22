-- preco_antigo é o preço "de/por" que a própria Magazord manda (promoção
-- deles, sem relação com forma de pagamento) — nunca foi o preço de cartão de
-- verdade. O preço de cartão (precoVenda da Magazord, antes do desconto de
-- Pix aplicado por cima) era calculado no backend mas descartado, nunca
-- salvo. Essa coluna guarda esse valor, pra carrinho/destaque poderem
-- mostrar Pix (preco) e Cartão (preco_cartao) como dois valores distintos e
-- corretos, sem misturar com o preco_antigo da Magazord.
alter table live_products add column preco_cartao numeric(10,2);
