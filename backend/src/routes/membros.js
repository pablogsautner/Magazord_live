import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

export const membrosRouter = Router();
membrosRouter.use(requireUser, requireSuperAdmin);

// membros.user_id aponta pra auth.users, que o PostgREST não expõe pra
// embedding automático — por isso buscamos os emails à parte e juntamos aqui.
membrosRouter.get('/', async (req, res) => {
  const { empresa_id } = req.query;
  if (!empresa_id) return res.status(400).json({ error: 'empresa_id_obrigatorio' });

  const supabase = getSupabase();
  const { data: membros, error } = await supabase
    .from('membros')
    .select('id, user_id, empresa_id, papel, created_at')
    .eq('empresa_id', empresa_id);
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) return res.status(500).json({ error: 'query_failed', message: usersError.message });
  const emailPorId = new Map(usersData.users.map((u) => [u.id, u.email]));

  res.json(membros.map((m) => ({ ...m, email: emailPorId.get(m.user_id) ?? null })));
});

membrosRouter.post('/', async (req, res) => {
  const { user_id, empresa_id, papel } = req.body;
  if (!user_id || !empresa_id) return res.status(400).json({ error: 'user_id_e_empresa_id_obrigatorios' });

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('membros')
    .insert({ user_id, empresa_id, papel: papel || 'admin' })
    .select()
    .single();
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

membrosRouter.delete('/:id', async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase.from('membros').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'delete_failed', message: error.message });
  res.status(204).end();
});
