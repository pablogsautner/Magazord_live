import { Router } from 'express';
import { config } from '../config.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.js';
import { mintPublishToken } from '../services/streamAuth.js';

export const liveStreamRouter = Router();
liveStreamRouter.use(requireUser);

const TTL_WHIP_SEGUNDOS = 5 * 60;
// OBS não é scriptável do nosso lado pra sempre pedir token novo num reconnect
// automático — TTL bem mais longo que o do WHIP (que é consumido na hora,
// pelo navegador, logo após ser emitido).
const TTL_RTMP_SEGUNDOS = 20 * 60;

liveStreamRouter.post('/:liveId/publish-token', async (req, res) => {
  const { liveId } = req.params;

  const empresaId = await empresaIdDaLive(liveId).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const whip = mintPublishToken({ liveId, empresaId, ttlSeconds: TTL_WHIP_SEGUNDOS });
  const rtmp = mintPublishToken({ liveId, empresaId, ttlSeconds: TTL_RTMP_SEGUNDOS });

  res.json({
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
