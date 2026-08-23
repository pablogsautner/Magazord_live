import { Hono } from 'npm:hono@4';
import { requireUser } from '../middleware/requireUser.ts';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.ts';
import { listarConfiguracoes, setConfiguracao } from '../services/configuracoes.ts';

export const configuracoesRouter = new Hono();
configuracoesRouter.use('*', requireUser, requireSuperAdmin);

configuracoesRouter.get('/', async (c) => {
  try {
    return c.json(await listarConfiguracoes());
  } catch (err) {
    return c.json({ error: 'query_failed', message: (err as Error).message }, 500);
  }
});

configuracoesRouter.put('/:chave', async (c) => {
  const { valor, criptografado } = await c.req.json();
  if (valor === undefined) return c.json({ error: 'valor_obrigatorio' }, 400);

  try {
    await setConfiguracao(c.req.param('chave'), valor, Boolean(criptografado));
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ error: 'update_failed', message: (err as Error).message }, 500);
  }
});
