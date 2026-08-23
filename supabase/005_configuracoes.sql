-- Configurações da plataforma (não confundir com "empresas", que guarda a
-- credencial da Magazord de cada cliente). Isso aqui é global e evita ter que
-- redeployar o backend só pra trocar uma chave de API de terceiro.
create table configuracoes (
  chave text primary key,
  valor text,
  criptografado boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table configuracoes enable row level security;

-- Sem policies de propósito: só o backend (service_role) acessa, via
-- painel interno protegido por SUPER_ADMIN_EMAILS.
