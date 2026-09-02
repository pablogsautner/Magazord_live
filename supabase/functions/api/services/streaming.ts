import { config } from '../config.ts';

// Busca o resumo completo do servidor de live (todos os streams ativos +
// saúde do servidor). audienciaWebrtc usa isso pra 1 live só; resumoStreaming
// exporta a mesma chamada crua pra quem precisar de todas (ex: métricas
// agregadas do painel interno) sem bater 2x no servidor de live.
async function buscarResumoStreaming() {
  const url = `${config.streaming.authServiceUrl}/api/summary`;
  const headers: Record<string, string> = {};
  if (config.streaming.dashboardUser) {
    const credencial = btoa(`${config.streaming.dashboardUser}:${config.streaming.dashboardPass}`);
    headers.Authorization = `Basic ${credencial}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Serviço de streaming ${url} -> HTTP ${res.status}: ${body}`);
  }
  return res.json(); // { server, streams, events }
}

export async function resumoStreaming() {
  return buscarResumoStreaming();
}

// Consulta o serviço de auth do servidor de live (SRS) pra saber quantos
// espectadores estão assistindo agora. Mesmo formato de retorno que
// audienciaAoVivo (YouTube) já usa — { ao_vivo, espectadores } — pra lives.ts
// não precisar de tratamento especial por trás do branch em GET /:id/audiencia.
// Diferente do YouTube, aqui a contagem é exata e sempre presente (é a
// contagem de sessões WHEP/RTMP no próprio servidor, não uma métrica de
// terceiro que pode vir vazia).
export async function audienciaWebrtc(liveId: string) {
  const { streams } = await buscarResumoStreaming();
  const stream = (streams as any[])?.find((s) => s.name === liveId);
  // whep_url vai sempre junto, ao vivo ou não: quem assiste (frontend do
  // Kauan ou qualquer outro) não deve saber a URL do servidor de live de
  // cor (não é escalável — trocar de VPS/região viraria deploy de front) —
  // pega ela daqui, igual o publish já devolve `whip.url` pronto.
  const whepUrl = `${config.streaming.serverPublicUrl}/rtc/v1/whep/?app=live&stream=${liveId}`;
  if (!stream || !stream.live) return { ao_vivo: false, espectadores: null, whep_url: whepUrl };
  return { ao_vivo: true, espectadores: stream.viewers?.length ?? null, whep_url: whepUrl };
}
