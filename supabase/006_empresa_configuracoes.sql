-- Configurações visuais/gerais de cada empresa (nome da loja exibido, tema,
-- cores, etc.) — diferente de "configuracoes" (que é global da plataforma) e
-- diferente de "empresas" (que guarda a credencial da Magazord).
create table empresa_configuracoes (
  empresa_id uuid primary key references empresas(id) on delete cascade,
  nome_loja text not null default 'Minha Loja',
  email_contato text,
  fuso_horario text not null default 'America/Sao_Paulo',
  idioma text not null default 'pt-BR',
  cor_primaria text not null default '#171717',
  cor_destaque text not null default '#171717',
  raio_borda text not null default 'lg' check (raio_borda in ('none', 'sm', 'md', 'lg', 'xl')),
  logo_url text,
  modo_tema text not null default 'sistema' check (modo_tema in ('claro', 'escuro', 'sistema')),
  atualizado_em timestamptz not null default now()
);

alter table empresa_configuracoes enable row level security;

-- Leitura pública: o player pode usar isso pra aplicar a marca da empresa
-- (cor, logo) na tela de quem assiste. Escrita só pelo backend (service_role).
create policy "leitura publica empresa_configuracoes" on empresa_configuracoes for select using (true);
