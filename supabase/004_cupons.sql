create table cupons (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  magazord_cupom_id int,               -- id do cupom lá na Magazord (nulo só se a criação lá falhar)
  codigo text not null,
  descricao text,
  tipo_desconto text not null check (tipo_desconto in ('percentual', 'fixo')),
  valor_desconto numeric(10,2) not null,
  valido_de timestamptz not null,
  valido_ate timestamptz not null,
  valor_minimo_pedido numeric(10,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index on cupons (live_id);

alter table cupons enable row level security;

-- Mesmo padrão de lives/live_products: leitura pública (o player pode mostrar
-- o cupom pra quem assiste), escrita só pelo backend (service_role).
create policy "leitura publica cupons" on cupons for select using (true);

alter publication supabase_realtime add table cupons;
