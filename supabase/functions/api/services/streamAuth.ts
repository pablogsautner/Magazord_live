import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { config } from '../config.ts';

function getSigningSecret() {
  const secret = config.streaming.signingSecret;
  if (!secret) {
    throw new Error('STREAM_SIGNING_SECRET não configurada. Gere com: openssl rand -hex 32');
  }
  return secret;
}

function assinar(payloadBase64Url: string) {
  return crypto.createHmac('sha256', getSigningSecret()).update(payloadBase64Url).digest('hex');
}

// Token curto (payload + assinatura HMAC, sem biblioteca de JWT) que autoriza
// UM publish no servidor de live — verificado lá (auth/hooks do SRS) de forma
// local, sem bater no nosso banco a cada tentativa de conexão. Cobre só o
// handshake de conexão, não a transmissão inteira: uma reconexão (queda de
// rede, restart do OBS) precisa mintar um token novo, não reaproveitar este.
export function mintPublishToken({
  liveId,
  empresaId,
  ttlSeconds,
}: {
  liveId: string;
  empresaId: string;
  ttlSeconds: number;
}) {
  const agora = Math.floor(Date.now() / 1000);
  const payload = {
    live_id: liveId,
    empresa_id: empresaId,
    role: 'publish',
    stream: liveId,
    iat: agora,
    exp: agora + ttlSeconds,
  };
  const payloadBase64Url = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const assinatura = assinar(payloadBase64Url);
  return {
    token: `${payloadBase64Url}.${assinatura}`,
    expires_at: new Date(payload.exp * 1000).toISOString(),
  };
}

// djb2 — precisa ser EXATAMENTE o mesmo hash (e a mesma contagem de
// instâncias, ver config.streaming.shardCount) usado em instanciaParaStream()
// do auth/server.js no repo sereniia-org/test-live-server. Lá, WHIP/WHEP
// sempre passam pelo mesmo proxy público e a instância é decidida por dentro
// — mas RTMP é conexão direta (TCP puro, sem proxy de aplicação na frente),
// então precisamos saber a porta certa ANTES de mintar a URL, aqui.
function hashStream(stream: string) {
  let hash = 5381;
  for (let i = 0; i < stream.length; i++) {
    hash = ((hash << 5) + hash + stream.charCodeAt(i)) >>> 0; // hash*33 + c
  }
  return hash;
}

// Cada instância do SRS ocupa uma porta RTMP sequencial a partir da base
// (1935, 1936, 1937...) — mesmo esquema do docker-compose.yml do
// test-live-server (RTMP_PORT por instância).
export function portaRtmpDaLive(liveId: string) {
  return config.streaming.rtmpPortaBase + (hashStream(liveId) % config.streaming.shardCount);
}
