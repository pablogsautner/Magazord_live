-- Roleta de cupons: sorteio ponderado por live, com trava de 1 giro por
-- pessoa. Antes disso a roleta inteira (itens e o próprio sorteio) rodava
-- só no localStorage do navegador — não dava pra impedir alguém de girar
-- de novo até cair no prêmio que quisesse, nem de ver a roleta de outro
-- dispositivo. Agora o sorteio roda aqui (backend), e a trava usa sessão
-- do navegador (gerada por quem assiste) + IP, o que vier primeiro bloqueia
-- uma segunda tentativa pela outra via.

create table roletas (
  live_id uuid primary key references lives(id) on delete cascade,
  ativa boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table roleta_itens (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  tipo text not null check (tipo in ('cupom', 'sem_premio')),
  coupon_id uuid references cupons(id) on delete set null,
  codigo text,
  descricao text not null,
  tipo_desconto text check (tipo_desconto in ('percentual', 'fixo')),
  valor_desconto numeric,
  peso numeric not null check (peso > 0),
  ordem int not null default 0
);

create index on roleta_itens (live_id);

-- Um giro por pessoa por live. unique(live_id, session_id) trava o caso
-- comum (mesma pessoa tentando de novo no mesmo navegador); o índice em
-- (live_id, ip) permite ao backend checar giro repetido pelo mesmo IP
-- mesmo que a sessão tenha sido trocada (ex: limpou localStorage).
create table roleta_giros (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  session_id text not null,
  ip text not null,
  roleta_item_id uuid not null references roleta_itens(id) on delete cascade,
  criado_em timestamptz not null default now(),
  unique (live_id, session_id)
);

create index on roleta_giros (live_id, ip);

alter table roletas enable row level security;
alter table roleta_itens enable row level security;
alter table roleta_giros enable row level security;

-- Leitura pública: o espectador vê a roleta e os itens sem login.
-- roleta_giros não tem policy nenhuma de propósito — é registro interno de
-- controle de abuso, só o backend (service_role) precisa enxergar.
create policy "leitura publica roletas" on roletas for select using (true);
create policy "leitura publica roleta_itens" on roleta_itens for select using (true);
