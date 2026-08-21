import { config } from '../config.js';

// Precisa rodar DEPOIS do requireUser (usa req.user). Verifica o email contra
// a lista SUPER_ADMIN_EMAILS — quem não está lá não acessa /empresas, /usuarios, /membros.
export function requireSuperAdmin(req, res, next) {
  const email = req.user?.email?.toLowerCase();
  if (!email || !config.superAdminEmails.includes(email)) {
    return res.status(403).json({ error: 'forbidden', message: 'Usuário não é super admin' });
  }
  next();
}
