-- Separa as cores do tema em 2 conjuntos por empresa (modo claro e modo
-- escuro) em vez de 1 conjunto só. `empresa_configuracoes.modo_tema`
-- continua controlando o comportamento: "claro"/"escuro" força um dos dois
-- conjuntos, "sistema" deixa o player escolher com base no SO de quem
-- está assistindo — mas agora os dois conjuntos de cores existem de verdade
-- e podem ser editados de forma independente.

create table empresa_temas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  modo text not null check (modo in ('claro', 'escuro')),

  -- Geometria
  border_radius text not null default 'lg' check (border_radius in ('none', 'sm', 'md', 'lg', 'xl')),

  -- Cor da marca e botões
  primary_color text not null default '#171717',
  primary_foreground text not null default '#ffffff',
  primary_hover text not null default '#000000',

  -- Superfícies e bordas
  page_background text not null default '#ffffff',
  card_background text not null default '#ffffff',
  card_border text not null default '#e5e5e5',

  -- Tipografia e textos
  heading_color text not null default '#171717',
  subheading_color text not null default '#737373',
  body_text_color text not null default '#404040',

  -- Destaques e badges (ex: "AO VIVO", "30% OFF")
  badge_background text not null default '#dc2626',
  badge_text text not null default '#ffffff',

  unique (empresa_id, modo)
);

alter table empresa_temas enable row level security;

-- Leitura pública: o player precisa ler os 2 modos pra poder trocar de tema
-- no cliente sem depender do backend. Escrita só pelo backend (service_role).
create policy "leitura publica empresa_temas" on empresa_temas for select using (true);

-- Migra os valores que já existiam em empresa_configuracoes pro modo "claro"
-- de cada empresa (era o único conjunto que existia até aqui).
insert into empresa_temas (
  empresa_id, modo, border_radius, primary_color, primary_foreground, primary_hover,
  page_background, card_background, card_border, heading_color, subheading_color,
  body_text_color, badge_background, badge_text
)
select
  empresa_id, 'claro', border_radius, primary_color, primary_foreground, primary_hover,
  page_background, card_background, card_border, heading_color, subheading_color,
  body_text_color, badge_background, badge_text
from empresa_configuracoes;

-- Cria o modo "escuro" com valores escuros de verdade — não faz sentido
-- começar com os mesmos valores do claro, ninguém ia enxergar nada.
insert into empresa_temas (
  empresa_id, modo, border_radius, primary_color, primary_foreground, primary_hover,
  page_background, card_background, card_border, heading_color, subheading_color,
  body_text_color, badge_background, badge_text
)
select
  empresa_id, 'escuro', border_radius, '#f5f5f5', '#171717', '#e5e5e5',
  '#0a0a0a', '#171717', '#262626', '#fafafa', '#a3a3a3',
  '#d4d4d4', badge_background, badge_text
from empresa_configuracoes;

-- As cores saem de empresa_configuracoes — agora moram só em empresa_temas.
alter table empresa_configuracoes
  drop column border_radius,
  drop column primary_color,
  drop column primary_foreground,
  drop column primary_hover,
  drop column page_background,
  drop column card_background,
  drop column card_border,
  drop column heading_color,
  drop column subheading_color,
  drop column body_text_color,
  drop column badge_background,
  drop column badge_text;
