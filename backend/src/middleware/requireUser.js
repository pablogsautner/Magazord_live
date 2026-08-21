import { getSupabase } from '../services/supabase.js';

// Confere o token de sessão real do Supabase Auth (o mesmo que o login já gera).
// Substitui a antiga chave fixa ADMIN_API_KEY — agora cada chamada é de um usuário identificado de verdade.
export async function requireUser(req, res, next) {
  const authHeader = req.header('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', message: 'Faltou o header Authorization: Bearer <token>' });
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: 'unauthorized', message: 'Sessão inválida ou expirada' });
  }

  req.user = { id: data.user.id, email: data.user.email };
  next();
}
