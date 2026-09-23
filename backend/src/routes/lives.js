import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario, empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.js';
import { audienciaAoVivo } from '../services/youtube.js';
import { audienciaWebrtc } from '../services/streaming.js';
import { historicoAudienciaLive } from '../services/metricas.js';

export const livesRouter = Router();

// Pública de propósito — o player (espectador anônimo) também lê isso, além
// do painel. Precisa vir ANTES do livesRouter.use(requireUser) abaixo, senão
// herdaria a exigência de login como o resto das rotas de /lives.
// youtube_video_id preenchido = live antiga (YouTube); vazio = live do
// servidor de live próprio (WebRTC) — não tem uma live nova nascendo com
// YouTube mais, então não precisa de uma coluna de "modo" à parte.
livesRouter.get('/:id/audiencia', async (req, res) => {
  const supabase = getSupabase();
  const { data: live, error } = await supabase.from('lives').select('id, youtube_video_id').eq('id', req.params.id).single();
  if (error) return res.status(404).json({ error: 'live_nao_encontrada' });

  try {
    const audiencia = live.youtube_video_id
      ? await audienciaAoVivo(live.youtube_video_id)
      : await audienciaWebrtc(live.id);
    res.json(audiencia);
  } catch (err) {
    res.status(502).json({ error: 'audiencia_failed', message: err.message });
  }
});

// Produtos ativos da live, na ordem de exibição — o que o player mostra na
// tela. Antes o front lia `live_products` direto do Supabase (RLS pública);
// passou pra cá pra a leitura inicial ser sempre pelo backend (service role,
// shape controlado). A assinatura Realtime dos updates ao vivo (produto
// adicionado/removido/destacado no meio da live) continua no canal do
// Supabase — isso o backend não faz push.
livesRouter.get('/:id/produtos', async (req, res) => {
  const { data, error } = await getSupabase()
    .from('live_products')
    .select('*')
    .eq('live_id', req.params.id)
    .eq('ativo', true)
    .order('ordem');
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });
  res.json(data ?? []);
});

// Cupons ativos da live, na ordem em que foram criados — o que o player
// mostra/aplica no checkout. Mesmo motivo do /produtos acima: leitura inicial
// pelo backend (service role), não RLS direta. Cupom criado/desativado no
// meio da live continua chegando pelo canal Realtime do Supabase.
livesRouter.get('/:id/cupons', async (req, res) => {
  const { data, error } = await getSupabase()
    .from('cupons')
    .select('*')
    .eq('live_id', req.params.id)
    .eq('ativo', true)
    .order('created_at');
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });
  res.json(data ?? []);
});

// Pública de propósito — é isso que o widget instalado no site do cliente
// (Magazord "Conteúdo de Página Adicional", ou qualquer um dos templates em
// /ecommerce-widget.html, /tarja-ao-vivo.html, /live-fullscreen.html) chama
// a cada 20s pra saber se tem live ao vivo AGORA pra essa empresa. Troca o
// polling direto no Supabase (anon key exposta no HTML) que esses widgets
// faziam antes — e como o widget só sabe o empresa_id (fixo, nunca muda),
// nunca mais precisa ser editado quando uma live nova começa ou termina.
livesRouter.get('/atual', async (req, res) => {
  const { empresa_id } = req.query;
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id_obrigatorio' });

  const { data, error } = await getSupabase()
    .from('lives')
    .select('id, titulo')
    .eq('empresa_id', empresa_id)
    .eq('status', 'ao_vivo')
    .order('created_at', { ascending: false })
    .limit(1);

  // empresa_id mal formado (não-uuid) também cai aqui — devolve "sem live"
  // em vez de vazar erro de banco pro script rodando no site do cliente.
  if (error) return res.json({ live_id: null, titulo: null });

  const live = data?.[0] ?? null;
  res.json({ live_id: live?.id ?? null, titulo: live?.titulo ?? null });
});

livesRouter.use(requireUser);

livesRouter.post('/', async (req, res) => {
  const { titulo, youtube_video_id } = req.body;
  if (!titulo) {
    return res.status(400).json({ error: 'campos_obrigatorios_faltando' });
  }

  const empresaId = await empresaUnicaDoUsuario(req.user.id);
  if (!empresaId) {
    return res.status(403).json({
      error: 'empresa_indefinida',
      message: 'Usuário precisa pertencer a exatamente uma empresa pra criar uma live (fale com o super admin).',
    });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('lives')
    .insert({ titulo, youtube_video_id, empresa_id: empresaId })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

livesRouter.patch('/:id', async (req, res) => {
  const empresaId = await empresaIdDaLive(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const { titulo, youtube_video_id, status, multicanal_rtmp_server_url, multicanal_rtmp_stream_key } = req.body;
  const STATUS_VALIDOS = ['agendada', 'ao_vivo', 'encerrada'];
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return res.status(400).json({ error: 'status_invalido', message: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` });
  }

  const campos = {};
  if (titulo !== undefined) campos.titulo = titulo;
  if (youtube_video_id !== undefined) campos.youtube_video_id = youtube_video_id;
  if (status !== undefined) campos.status = status;
  // Destino opcional de simulcast (forward RTMP) — null limpa o destino. Ver
  // destinoMulticanalDaLive/mintPublishToken.
  if (multicanal_rtmp_server_url !== undefined) campos.multicanal_rtmp_server_url = multicanal_rtmp_server_url;
  if (multicanal_rtmp_stream_key !== undefined) campos.multicanal_rtmp_stream_key = multicanal_rtmp_stream_key;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('lives')
    .update(campos)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        error: 'ja_existe_live_ao_vivo',
        message: 'Essa empresa já tem uma live ao vivo agora — encerre-a antes de iniciar outra.',
      });
    }
    return res.status(500).json({ error: 'update_failed', message: error.message });
  }
  res.json(data);
});

// Histórico de audiência dessa live só (não confundir com GET /:id/audiencia,
// que é tempo real e público) — pro lojista ver na tela de gerenciar/insights
// da própria live. Mesma checagem de tenancy de PATCH/DELETE acima.
livesRouter.get('/:id/metricas', async (req, res) => {
  const empresaId = await empresaIdDaLive(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  try {
    res.json(await historicoAudienciaLive(req.params.id));
  } catch (err) {
    res.status(500).json({ error: 'metricas_failed', message: err.message });
  }
});

livesRouter.delete('/:id', async (req, res) => {
  const empresaId = await empresaIdDaLive(req.params.id).catch(() => null);
  if (!empresaId) return res.status(404).json({ error: 'live_nao_encontrada' });
  if (!(await usuarioPertenceAEmpresa(req.user.id, empresaId))) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('lives').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'delete_failed', message: error.message });
  res.status(204).end();
});
