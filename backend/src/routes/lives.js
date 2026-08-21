import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { empresaUnicaDoUsuario, empresaIdDaLive, usuarioPertenceAEmpresa } from '../services/tenancy.js';

export const livesRouter = Router();
livesRouter.use(requireUser);

livesRouter.post('/', async (req, res) => {
  const { titulo, youtube_video_id } = req.body;
  if (!titulo || !youtube_video_id) {
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

  const { titulo, youtube_video_id } = req.body;
  const campos = {};
  if (titulo !== undefined) campos.titulo = titulo;
  if (youtube_video_id !== undefined) campos.youtube_video_id = youtube_video_id;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('lives')
    .update(campos)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
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
