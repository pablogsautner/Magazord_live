create table empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  magazord_base_url text not null,
  magazord_user text not null,
  magazord_password text not null,
  magazord_tabela_preco_id text not null default '1',
  magazord_loja_id text not null default '1',
  magazord_storefront_url text not null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create table membros (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  papel text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (user_id, empresa_id)
);

create index on membros (empresa_id);
create index on membros (user_id);

alter table empresas enable row level security;
alter table membros enable row level security;

-- Sem policies de propósito: são tabelas de controle (guardam credencial da
-- Magazord de cada empresa) e só o backend (service_role) deve acessá-las,
-- via o painel interno protegido por SUPER_ADMIN_API_KEY. Nenhum cliente
-- (anon ou authenticated) enxerga essas tabelas direto pelo Supabase.
