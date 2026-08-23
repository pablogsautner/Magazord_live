import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaUnicaDoUsuario, empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.ts';
import { audienciaAoVivo } from '../services/youtube.ts';

export const livesRouter = new Hono();
livesRouter.use('*', requireUser);

livesRouter.get('/:id/audiencia', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user') as { id: string };

  const empresaId = await empresaIdDaLive(id).catch(() => null);
  if (!empresaId) return c.json({ error: 'live_nao_encontrada' }, 404);
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const supabase = getSupabase();
  const { data: live, error } = await supabase.from('lives').select('youtube_video_id').eq('id', id).single();
  if (error) return c.json({ error: 'live_nao_encontrada' }, 404);

  try {
    const audiencia = await audienciaAoVivo((live as any).youtube_video_id);
    return c.json(audiencia);
  } catch (err) {
    return c.json({ error: 'youtube_audiencia_failed', message: (err as Error).message }, 502);
  }
});

livesRouter.post('/', async (c) => {
  const { titulo, youtube_video_id } = await c.req.json();
  if (!titulo || !youtube_video_id) {
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

  const { titulo, youtube_video_id, status } = await c.req.json();
  const STATUS_VALIDOS = ['agendada', 'ao_vivo', 'encerrada'];
  if (status !== undefined && !STATUS_VALIDOS.includes(status)) {
    return c.json({ error: 'status_invalido', message: `status deve ser um de: ${STATUS_VALIDOS.join(', ')}` }, 400);
  }

  const campos: Record<string, string> = {};
  if (titulo !== undefined) campos.titulo = titulo;
  if (youtube_video_id !== undefined) campos.youtube_video_id = youtube_video_id;
  if (status !== undefined) campos.status = status;

  const supabase = getSupabase();
  const { data, error } = await supabase.from('lives').update(campos).eq('id', id).select().single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
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
