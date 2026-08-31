create table produto_caracteristicas (
  produto_codigo text primary key,
  id_produto_magazord bigint,             -- idProduto numérico da Magazord; guardado pra uma etapa futura (avaliações), não usado agora
  titulo text,                            -- produtoLoja[].titulo — pode diferir do nome curto usado em live_products.nome
  descricao text,                         -- produtoLoja[].descricao — HTML rico, o mesmo texto da página de produto da loja
  descricao_resumida text,
  marca text,
  categorias text[],
  ean text,
  peso numeric,
  largura numeric,
  altura numeric,
  comprimento numeric,
  atributos jsonb not null default '[]',  -- [{ "nome": "Composição", "valor": "90% Algodão" }, ...] — schema variável por categoria de produto
  atualizado_em timestamptz not null default now()
);

alter table produto_caracteristicas enable row level security;

-- Mesmo padrão de live_products/comentarios/roletas: leitura pública direto
-- do Supabase (o player não precisa passar pelo backend pra ver ficha
-- técnica), escrita só pelo backend (service_role, sem policy de insert/
-- update/delete aqui).
create policy "Leitura pública de características de produto"
  on produto_caracteristicas for select
  using (true);
