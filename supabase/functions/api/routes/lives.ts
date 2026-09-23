import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaUnicaDoUsuario, empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';
import { audienciaAoVivo } from '../services/youtube.ts';
import { audienciaWebrtc } from '../services/streaming.ts';
import { historicoAudienciaLive } from '../services/metricas.ts';

export const livesRouter = new Hono();

// Pública de propósito — o player (espectador anônimo) também lê isso, além
// do painel. Precisa vir ANTES do livesRouter.use('*', requireUser) abaixo,
// senão herdaria a exigência de login como o resto das rotas de /lives.
// youtube_video_id preenchido = live antiga (YouTube); vazio = live do
// servidor de live próprio (WebRTC) — não tem uma live nova nascendo com
// YouTube mais, então não precisa de uma coluna de "modo" à parte.
livesRouter.get('/:id/audiencia', async (c) => {
  const id = c.req.param('id');
  const supabase = getSupabase();
  const { data: live, error } = await supabase.from('lives').select('id, youtube_video_id').eq('id', id).single();
  if (error) return c.json({ error: 'live_nao_encontrada' }, 404);

  try {
    const audiencia = (live as any).youtube_video_id
      ? await audienciaAoVivo((live as any).youtube_video_id)
      : await audienciaWebrtc((live as any).id);
    return c.json(audiencia);
  } catch (err) {
    return c.json({ error: 'audiencia_failed', message: (err as Error).message }, 502);
  }
});

// Produtos ativos da live, na ordem de exibição — o que o player mostra na
// tela. Antes o front lia `live_products` direto do Supabase (RLS pública);
// passou pra cá pra a leitura inicial ser sempre pelo backend (service role,
// shape controlado). A assinatura Realtime dos updates ao vivo (produto
// adicionado/removido/destacado no meio da live) continua no canal do
// Supabase — isso o backend não faz push.
livesRouter.get('/:id/produtos', async (c) => {
  const { data, error } = await getSupabase()
    .from('live_products')
    .select('*')
    .eq('live_id', c.req.param('id'))
    .eq('ativo', true)
    .order('ordem');
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  return c.json(data ?? []);
});

// Cupons ativos da live, na ordem em que foram criados — o que o player
// mostra/aplica no checkout. Mesmo motivo do /produtos acima: leitura inicial
// pelo backend (service role), não RLS direta. Cupom criado/desativado no
// meio da live continua chegando pelo canal Realtime do Supabase.
livesRouter.get('/:id/cupons', async (c) => {
  const { data, error } = await getSupabase()
    .from('cupons')
    .select('*')
    .eq('live_id', c.req.param('id'))
    .eq('ativo', true)
    .order('created_at');
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  return c.json(data ?? []);
});

// Pública de propósito — é isso que o widget instalado no site do cliente
// (Magazord "Conteúdo de Página Adicional", ou qualquer um dos templates em
// /ecommerce-widget.html, /tarja-ao-vivo.html, /live-fullscreen.html) chama
// a cada 20s pra saber se tem live ao vivo AGORA pra essa empresa. Troca o
// polling direto no Supabase (anon key exposta no HTML) que esses widgets
// faziam antes — e como o widget só sabe o empresa_id (fixo, nunca muda),
// nunca mais precisa ser editado quando uma live nova começa ou termina.
livesRouter.get('/atual', async (c) => {
  const empresaId = c.req.query('empresa_id');
  if (!empresaId) return c.json({ error: 'empresa_id_obrigatorio' }, 400);

  const { data, error } = await getSupabase()
    .from('lives')
    .select('id, titulo')
    .eq('empresa_id', empresaId)
    .eq('status', 'ao_vivo')
    .order('created_at', { ascending: false })
    .limit(1);

  // empresa_id mal formado (não-uuid) também cai aqui — devolve "sem live"
  // em vez de vazar erro de banco pro script rodando no site do cliente.
  if (error) return c.json({ live_id: null, titulo: null });

  const live = (data as any)?.[0] ?? null;
  return c.json({ live_id: live?.id ?? null, titulo: live?.titulo ?? null });
});

livesRouter.use('*', requireUser);

livesRouter.post('/', async (c) => {
  const { titulo, youtube_video_id } = await c.req.json();
  if (!titulo) {
    return c.json({ error: 'campos_obrigatorios_faltando' }, 400);
  }

  const user = c.get('user') as { id: string };
  const empresaId = await empresaUnicaDoUsuario(user.id);
  if (!empresaId) {
    return c.json(
      {
        error: 'empresa_indefinida',
        message: 'Usuário precisa pertencer a exatamente uma empresa pra criar uma live (fale com o super admin).',
      },
      403
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('lives')
    .insert({ titulo, youtube_video_id, empresa_id: empresaId })
    .select()
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);
  return c.json(data, 201);
});

livesRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const { titulo, youtube_video_id, status, multicanal_rtmp_server_url, multicanal_rtmp_stream_key } = await c.req.json();
  const STATUS_VALIDOS = ['agendada', 'ao_vivo', 'encerrada'];
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return c.json({ error: 'status_invalido', message: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` }, 400);
  }

  const campos: Record<string, string | null> = {};
  if (titulo !== undefined) campos.titulo = titulo;
  if (youtube_video_id !== undefined) campos.youtube_video_id = youtube_video_id;
  if (status !== undefined) campos.status = status;
  // Destino opcional de simulcast (forward RTMP) — null limpa o destino. Ver
  // destinoMulticanalDaLive/mintPublishToken.
  if (multicanal_rtmp_server_url !== undefined) campos.multicanal_rtmp_server_url = multicanal_rtmp_server_url;
  if (multicanal_rtmp_stream_key !== undefined) campos.multicanal_rtmp_stream_key = multicanal_rtmp_stream_key;

  const supabase = getSupabase();
  const { data, error } = await supabase.from('lives').update(campos).eq('id', id).select().single();
  if (error) {
    if (error.code === '23505') {
      return c.json(
        {
          error: 'ja_existe_live_ao_vivo',
          message: 'Essa empresa já tem uma live ao vivo agora — encerre-a antes de iniciar outra.',
        },
        409
      );
    }
    return c.json({ error: 'update_failed', message: error.message }, 500);
  }
  return c.json(data);
});

// Histórico de audiência dessa live só (não confundir com GET /:id/audiencia,
// que é tempo real e público) — pro lojista ver na tela de gerenciar/insights
// da própria live. Mesma checagem de tenancy de PATCH/DELETE acima.
livesRouter.get('/:id/metricas', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  try {
    return c.json(await historicoAudienciaLive(id));
  } catch (err) {
    return c.json({ error: 'metricas_failed', message: (err as Error).message }, 500);
  }
});

livesRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from('lives').delete().eq('id', id);
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});
