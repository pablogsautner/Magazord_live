import { getConfiguracao } from './configuracoes.ts';

// Só leitura de estatísticas públicas — usa API key simples, sem OAuth/login do Google.
export async function audienciaAoVivo(videoId: string) {
  const apiKey = await getConfiguracao('youtube_api_key');
  if (!apiKey) {
    throw new Error('youtube_api_key não configurada (cadastre via PUT /configuracoes/youtube_api_key)');
  }

  const url = `https://www.googleapis.com/youtube/v3/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube videos.list -> HTTP ${res.status}: ${body}`);
  }

  const json = await res.json();
  const detalhes = json.items?.[0]?.liveStreamingDetails;
  if (!detalhes) return { ao_vivo: false, espectadores: null };

  const emTransmissao = Boolean(detalhes.actualStartTime) && !detalhes.actualEndTime;
  return {
    ao_vivo: emTransmissao,
    espectadores: emTransmissao && detalhes.concurrentViewers ? Number(detalhes.concurrentViewers) : null,
  };
}
