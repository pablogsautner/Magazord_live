import { getSupabase } from './supabase.js';

// Histórico de audiência de UMA live específica, a partir do que o cron de
// captura (metricas.js, POST /metricas/capturar) já foi salvando em
// metricas_lives_snapshot. Puro histórico (o que já foi capturado) — audiência
// em tempo real continua sendo GET /lives/:id/audiencia, que já existe.
export async function historicoAudienciaLive(liveId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('metricas_lives_snapshot')
    .select('capturado_em, espectadores')
    .eq('live_id', liveId)
    .order('capturado_em');
  if (error) throw new Error(`Falha ao ler metricas_lives_snapshot: ${error.message}`);

  const valores = (data ?? []).map((p) => p.espectadores ?? 0);
  return {
    pico_espectadores: valores.length ? Math.max(...valores) : null,
    media_espectadores: valores.length ? Number((valores.reduce((a, b) => a + b, 0) / valores.length).toFixed(1)) : null,
    pontos: data ?? [],
  };
}
