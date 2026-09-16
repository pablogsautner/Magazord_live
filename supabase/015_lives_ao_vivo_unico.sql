-- No máximo 1 live "ao_vivo" por empresa ao mesmo tempo — sem isso, 2 PATCHs
-- concorrentes (2 operadores, ou duplo clique) podiam deixar 2 lives ao_vivo
-- juntas pra mesma empresa, e GET /lives/atual escolheria uma pelas costas
-- de quem perdeu a corrida, sem erro nenhum. Índice parcial: só existe a
-- restrição de unicidade entre linhas com status = 'ao_vivo', então agendada
-- e encerrada nunca colidem entre si nem com ela. Serve também de índice
-- pronto pra GET /lives/atual (mesmo filtro: empresa_id + status ao_vivo).
--
-- Achado antes de aplicar: existiam 4 lives "ao_vivo" simultâneas pra uma
-- mesma empresa (sobra de teste) — precisou encerrar essas 4 à mão via
-- PATCH /lives/:id antes desse índice conseguir ser criado.
create unique index lives_uma_ao_vivo_por_empresa
  on lives (empresa_id)
  where status = 'ao_vivo';
