import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.ts';

export const usuariosRouter = new Hono();
usuariosRouter.use('*', requireUser, requireSuperAdmin);

usuariosRouter.get('/', async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);

  const usuarios = data.users.map((u) => ({ id: u.id, email: u.email, created_at: u.created_at }));
  return c.json(usuarios);
});

usuariosRouter.post('/', async (c) => {
  const { email, password } = await c.req.json();
  if (!email || !password) return c.json({ error: 'email_e_senha_obrigatorios' }, 400);

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return c.json({ error: 'create_failed', message: error.message }, 500);

  return c.json({ id: data.user.id, email: data.user.email, created_at: data.user.created_at }, 201);
});

usuariosRouter.delete('/:id', async (c) => {
  const supabase = getSupabase();
  const { error } = await supabase.auth.admin.deleteUser(c.req.param('id'));
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});
