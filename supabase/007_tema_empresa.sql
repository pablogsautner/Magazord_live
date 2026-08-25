-- Expande as configurações de tema por empresa. Substitui os campos antigos
-- (cor_primaria, cor_destaque, raio_borda) por um conjunto bem mais completo
-- de tokens de cor, cobrindo botão, superfícies, tipografia e badges.

alter table empresa_configuracoes
  drop column if exists cor_primaria,
  drop column if exists cor_destaque,
  drop column if exists raio_borda;

alter table empresa_configuracoes
  -- Geometria
  add column border_radius text not null default 'lg' check (border_radius in ('none', 'sm', 'md', 'lg', 'xl')),

  -- Cor da marca e botões
  add column primary_color text not null default '#171717',
  add column primary_foreground text not null default '#ffffff',
  add column primary_hover text not null default '#000000',

  -- Superfícies e bordas
  add column page_background text not null default '#ffffff',
  add column card_background text not null default '#ffffff',
  add column card_border text not null default '#e5e5e5',

  -- Tipografia e textos
  add column heading_color text not null default '#171717',
  add column subheading_color text not null default '#737373',
  add column body_text_color text not null default '#404040',

  -- Destaques e badges (ex: "AO VIVO", "30% OFF")
  add column badge_background text not null default '#dc2626',
  add column badge_text text not null default '#ffffff';
