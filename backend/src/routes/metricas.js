import { Router } from 'express';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { getSupabase } from '../services/supabase.js';
import { resumoStreaming } from '../services/streaming.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

export const metricasRouter = Router();

function segredoCronValido(recebido) {
  const esperado = config.metricsCronSecret;
  if (!esperado || !recebido) return false;
  const bufEsperado = Buffer.from(esperado);
  const bufRecebido = Buffer.from(String(recebido));
  if (bufEsperado.length !== bufRecebido.length) return false;
  return crypto.timingSafeEqual(bufEsperado, bufRecebido);
}

// Aceita dois jeitos de autorizar a mesma captura: o segredo do pg_cron
// (chamada de máquina, sem usuário, dispara a cada 15 min) OU uma sessão de
// super-admin de verdade (captura manual "na hora", sem esperar o próximo
// tick do cron).
function autorizarCaptura(req, res, next) {
  if (segredoCronValido(req.headers['x-cron-secret'])) return next();
  requireUser(req, res, () => requireSuperAdmin(req, res, next));
}

// Roda ANTES do requireUser/requireSuperAdmin do resto do router — essa rota
// também precisa aceitar a chamada do pg_cron, que não tem usuário nenhum.
metricasRouter.post('/capturar', autorizarCaptura, async (req, res) => {
  try {
    const { streams } = await resumoStreaming();
    const supabase = getSupabase();
    const { data: lives } = await supabase.from('lives').select('id, empresa_id').eq('status', 'ao_vivo');
    const linhas = (lives ?? []).map((live) => ({
      live_id: live.id,
      empresa_id: live.empresa_id,
      espectadores: streams?.find((s) => s.name === live.id)?.viewers?.length ?? null,
    }));
    if (linhas.length) await supabase.from('metricas_lives_snapshot').insert(linhas);
    res.json({ ok: true, capturado: linhas.length });
  } catch (err) {
    res.status(502).json({ error: 'captura_failed', message: err.message });
  }
});

metricasRouter.use(requireUser, requireSuperAdmin);

// Tempo real: lives ao vivo agora + audiência atual + saúde do servidor de
// live. ?empresa_id= filtra pra uma empresa só; sem isso, visão cross-empresa
// completa (com um breakdown por_empresa de brinde, calculado em memória
// sobre o mesmo resultado, sem query extra).
metricasRouter.get('/', async (req, res) => {
  const empresaId = req.query.empresa_id;
  const supabase = getSupabase();
  let query = supabase.from('lives').select('id, titulo, empresa_id, created_at, empresas(nome)').eq('status', 'ao_vivo');
  if (empresaId) query = query.eq('empresa_id', empresaId);

  const [{ data: lives, error }, resumo] = await Promise.all([
    query,
    // Servidor de live fora do ar não deveria derrubar a listagem de lives.
    resumoStreaming().catch(() => ({ server: null, streams: [] })),
  ]);
  if (error) return res.status(500).json({ error: 'metricas_failed', message: error.message });

  const livesComAudiencia = (lives ?? []).map((live) => ({
    ...live,
    espectadores: resumo.streams?.find((s) => s.name === live.id)?.viewers?.length ?? null,
  }));

  const porEmpresa = new Map();
  for (const live of livesComAudiencia) {
    const chave = live.empresa_id ?? 'sem_empresa';
    const atual = porEmpresa.get(chave) ?? {
      empresa_id: live.empresa_id,
      empresa_nome: live.empresas?.nome ?? null,
      lives_ao_vivo: 0,
      espectadores: 0,
    };
    atual.lives_ao_vivo += 1;
    atual.espectadores += live.espectadores ?? 0;
    porEmpresa.set(chave, atual);
  }

  res.json({
    servidor: resumo.server,
    lives_ao_vivo: livesComAudiencia,
    total_lives_ao_vivo: livesComAudiencia.length,
    total_espectadores: livesComAudiencia.reduce((soma, l) => soma + (l.espectadores ?? 0), 0),
    por_empresa: [...porEmpresa.values()].sort((a, b) => b.espectadores - a.espectadores),
  });
});

// Série temporal a partir do snapshot capturado pelo cron (ou pela captura
// manual). A agregação mora numa função SQL (metricas_lives_historico, ver
// migração 014) em vez de código JS, pra Express e Edge Function chamarem a
// mesma lógica sem duplicar a query nos dois lados.
metricasRouter.get('/historico', async (req, res) => {
  const horas = Number(req.query.horas) || 24;
  const empresaId = req.query.empresa_id || null;
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('metricas_lives_historico', { p_horas: horas, p_empresa_id: empresaId });
  if (error) return res.status(500).json({ error: 'historico_failed', message: error.message });
  res.json(data);
});
