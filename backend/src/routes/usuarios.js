import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';

export const usuariosRouter = Router();
usuariosRouter.use(requireUser, requireSuperAdmin);

usuariosRouter.get('/', async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });

  const usuarios = data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));
  res.json(usuarios);
});

usuariosRouter.post('/', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'email_e_senha_obrigatorios' });

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) return res.status(500).json({ error: 'create_failed', message: error.message });

  res.status(201).json({ id: data.user.id, email: data.user.email, created_at: data.user.created_at });
});

usuariosRouter.delete('/:id', async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ error: 'delete_failed', message: error.message });
  res.status(204).end();
});
