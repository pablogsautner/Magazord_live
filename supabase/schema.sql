create extension if not exists pgcrypto;

create table lives (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  youtube_video_id text not null,
  status text not null default 'agendada', -- agendada | ao_vivo | encerrada
  created_at timestamptz not null default now()
);

create table live_products (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  produto_codigo text not null,        -- código da derivação no Magazord
  nome text not null,
  imagem_url text,
  preco numeric(10,2),
  preco_antigo numeric(10,2),
  estoque int,
  ativo boolean not null default true,     -- visível pro viewer agora
  destaque boolean not null default false, -- produto fixado/em foco
  ordem int not null default 0,
  url_produto text not null,           -- link da página real do produto na loja
  atualizado_em timestamptz not null default now()
);

create index on live_products (live_id, ativo, ordem);

alter table lives enable row level security;
alter table live_products enable row level security;

-- Leitura pública: o player (dentro do iframe) não faz login.
create policy "leitura publica lives" on lives for select using (true);
create policy "leitura publica live_products" on live_products for select using (true);

-- Escrita só pra usuários autenticados (o painel admin loga via Supabase Auth).
create policy "escrita autenticada lives" on lives for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

create policy "escrita autenticada live_products" on live_products for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

-- Habilita Realtime nas duas tabelas.
alter publication supabase_realtime add table lives;
alter publication supabase_realtime add table live_products;
