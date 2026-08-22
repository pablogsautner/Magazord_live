import type { Context, Next } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';

export async function requireUser(c: Context, next: Next) {
  const authHeader = c.req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: 'unauthorized', message: 'Faltou o header Authorization: Bearer <token>' }, 401);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return c.json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' }, 401);
  }

  c.set('user', { id: data.user.id, email: data.user.email });
  await next();
}
