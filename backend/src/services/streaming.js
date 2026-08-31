import { config } from '../config.js';

// Consulta o serviço de auth do servidor de live (SRS) pra saber quantos
// espectadores estão assistindo agora. Mesmo formato de retorno que
// audienciaAoVivo (YouTube) já usa — { ao_vivo, espectadores } — pra lives.js
// não precisar de tratamento especial por trás do branch em GET /:id/audiencia.
// Diferente do YouTube, aqui a contagem é exata e sempre presente (é a
// contagem de sessões WHEP/RTMP no próprio servidor, não uma métrica de
// terceiro que pode vir vazia).
export async function audienciaWebrtc(liveId) {
  const url = `${config.streaming.authServiceUrl}/api/summary`;
  const headers = {};
  if (config.streaming.dashboardUser) {
    const credencial = Buffer.from(`${config.streaming.dashboardUser}:${config.streaming.dashboardPass}`).toString('base64');
    headers.Authorization = `Basic ${credencial}`;
  }
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Serviço de streaming ${url} -> HTTP ${res.status}: ${body}`);
  }

  const { streams } = await res.json();
  const stream = streams?.find((s) => s.name === liveId);
  if (!stream || !stream.live) return { ao_vivo: false, espectadores: null };
  return { ao_vivo: true, espectadores: stream.viewers?.length ?? null };
}
