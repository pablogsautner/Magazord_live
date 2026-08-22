import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.ts';

export const membrosRouter = new Hono();
membrosRouter.use('*', requireUser, requireSuperAdmin);

membrosRouter.get('/', async (c) => {
  const empresaId = c.req.query('empresa_id');
  if (!empresaId) return c.json({ error: 'empresa_id_obrigatorio' }, 400);

  const supabase = getSupabase();
  const { data: membros, error } = await supabase
    .from('membros')
    .select('id, user_id, empresa_id, papel, created_at')
    .eq('empresa_id', empresaId);
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) return c.json({ error: 'query_failed', message: usersError.message }, 500);
  const emailPorId = new Map(usersData.users.map((u) => [u.id, u.email]));

  return c.json((membros as any[]).map((m) => ({ ...m, email: emailPorId.get(m.user_id) ?? null })));
});

membrosRouter.post('/', async (c) => {
  const { user_id, empresa_id, papel } = await c.req.json();
  if (!user_id || !empresa_id) return c.json({ error: 'user_id_e_empresa_id_obrigatorios' }, 400);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('membros')
    .insert({ user_id, empresa_id, papel: papel || 'admin' })
    .select()
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);
  return c.json(data, 201);
});

membrosRouter.delete('/:id', async (c) => {
  const supabase = getSupabase();
  const { error } = await supabase.from('membros').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});
