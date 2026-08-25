-- Comentários do chat ao vivo: espectador digita um nome e uma mensagem
-- na tela do player, sem precisar de login (é público, não é usuário da
-- plataforma). Diferente de tudo que existe até aqui, essa é a primeira
-- escrita pública do sistema — por isso a escrita NÃO fica liberada direto
-- no Supabase (evita virar porta aberta pra spam/flood); só o backend
-- escreve, via POST /comentarios (rota pública, sem token, mas com
-- validação de tamanho e rate limiting igual as outras rotas).
create table comentarios (
  id uuid primary key default gen_random_uuid(),
  live_id uuid not null references lives(id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 60),
  texto text not null check (char_length(texto) between 1 and 500),
  created_at timestamptz not null default now()
);

create index on comentarios (live_id, created_at);

alter table comentarios enable row level security;

-- Leitura pública: o player lê e assina via Realtime pra mostrar o chat
-- entrando ao vivo, sem precisar dar polling.
create policy "leitura publica comentarios" on comentarios for select using (true);

-- Habilita Realtime (INSERT) pra essa tabela, pro chat aparecer na hora.
alter publication supabase_realtime add table comentarios;
