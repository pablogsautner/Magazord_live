create table metricas_lives_snapshot (
  id bigint generated always as identity primary key,
  live_id uuid not null references lives(id) on delete cascade,
  empresa_id uuid references empresas(id),
  espectadores integer,
  capturado_em timestamptz not null default now()
);

create index metricas_lives_snapshot_live_idx on metricas_lives_snapshot (live_id, capturado_em desc);
create index metricas_lives_snapshot_tempo_idx on metricas_lives_snapshot (capturado_em desc);

alter table metricas_lives_snapshot enable row level security;

-- Sem policy nenhuma de propósito, igual empresas/membros: é dado
-- operacional interno (painel super-admin), não do player público — só o
-- backend (service_role) lê/escreve.

-- Agregação por ponto de captura (cada tick do pg_cron é um ponto no tempo).
-- Função SQL em vez de agregar em JS pra existir num lugar só, já que
-- backend/src (Express) e supabase/functions/api (Edge Function) chamam essa
-- mesma lógica cada um do seu lado — assim não duplica a query nos dois.
create or replace function metricas_lives_historico(p_horas integer, p_empresa_id uuid default null)
returns table (capturado_em timestamptz, total_lives bigint, total_espectadores bigint)
language sql
stable
as $$
  select capturado_em, count(*) as total_lives, sum(coalesce(espectadores, 0)) as total_espectadores
  from metricas_lives_snapshot
  where capturado_em > now() - (p_horas || ' hours')::interval
    and (p_empresa_id is null or empresa_id = p_empresa_id)
  group by capturado_em
  order by capturado_em;
$$;
