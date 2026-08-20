import { config } from '../config.js';

export function adminAuth(req, res, next) {
  const key = req.header('x-admin-key');
  if (!config.adminApiKey || key !== config.adminApiKey) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
}
