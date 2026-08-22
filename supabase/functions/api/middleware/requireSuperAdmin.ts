import type { Context, Next } from 'npm:hono@4';
import { config } from '../config.ts';

export async function requireSuperAdmin(c: Context, next: Next) {
  const user = c.get('user') as { email?: string } | undefined;
  const email = user?.email?.toLowerCase();
  if (!email || !config.superAdminEmails.includes(email)) {
    return c.json({ error: 'forbidden', message: 'Usuário não é super admin' }, 403);
  }
  await next();
}
