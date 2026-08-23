import { Router } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { listarConfiguracoes, setConfiguracao } from '../services/configuracoes.js';

export const configuracoesRouter = Router();
configuracoesRouter.use(requireUser, requireSuperAdmin);

configuracoesRouter.get('/', async (req, res) => {
  try {
    res.json(await listarConfiguracoes());
  } catch (err) {
    res.status(500).json({ error: 'query_failed', message: err.message });
  }
});

configuracoesRouter.put('/:chave', async (req, res) => {
  const { valor, criptografado } = req.body;
  if (valor === undefined) return res.status(400).json({ error: 'valor_obrigatorio' });

  try {
    await setConfiguracao(req.params.chave, valor, Boolean(criptografado));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'update_failed', message: err.message });
  }
});
