import { Hono } from 'npm:hono@4';
import { config } from '../config.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';
import { mintPublishToken } from '../services/streamAuth.ts';

export const liveStreamRouter = new Hono();
liveStreamRouter.use('*', requireUser);

const TTL_WHIP_SEGUNDOS = 5 * 60;
// OBS não é scriptável do nosso lado pra sempre pedir token novo num reconnect
// automático — TTL bem mais longo que o do WHIP (que é consumido na hora,
// pelo navegador, logo após ser emitido).
const TTL_RTMP_SEGUNDOS = 20 * 60;

liveStreamRouter.post('/:liveId/publish-token', async (c) => {
  const liveId = c.req.param('liveId');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(liveId).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const whip = await mintPublishToken({ liveId, empresaId, ttlSeconds: TTL_WHIP_SEGUNDOS });
  const rtmp = await mintPublishToken({ liveId, empresaId, ttlSeconds: TTL_RTMP_SEGUNDOS });

  return c.json({
    whip: {
      url: `${config.streaming.serverPublicUrl}/rtc/v1/whip/?app=live&stream=${liveId}&token=${whip.token}`,
      token: whip.token,
      expires_at: whip.expires_at,
    },
    rtmp: {
      server_url: config.streaming.rtmpPublicUrl,
      stream_key: `${liveId}?token=${rtmp.token}`,
      expires_at: rtmp.expires_at,
    },
  });
});
