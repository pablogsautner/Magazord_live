alter table lives add column empresa_id uuid references empresas(id);
create index on lives (empresa_id);

-- Sem "not null" de propósito: já existem lives de teste sem empresa (serão
-- vinculadas via API logo em seguida). Daqui pra frente o backend já exige
-- empresa_id em toda live nova (POST /lives resolve sozinho pela empresa do usuário).

-- Fecha a porta dos fundos: escrita direta do front pro Supabase (com token de
-- sessão) não é mais permitida — toda escrita passa pelo backend agora, que
-- confere o vínculo empresa↔usuário antes de usar a service_role key.
drop policy "escrita autenticada lives" on lives;
drop policy "escrita autenticada live_products" on live_products;
