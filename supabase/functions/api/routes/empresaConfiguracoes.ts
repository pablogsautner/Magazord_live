import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const empresaConfiguracoesRouter = new Hono();
empresaConfiguracoesRouter.use('*', requireUser);

const CAMPOS_VALIDOS = [
  'nome_loja',
  'email_contato',
  'fuso_horario',
  'idioma',
  'cor_primaria',
  'cor_destaque',
  'raio_borda',
  'logo_url',
  'modo_tema',
];
const RAIOS_VALIDOS = ['none', 'sm', 'md', 'lg', 'xl'];
const MODOS_VALIDOS = ['claro', 'escuro', 'sistema'];

empresaConfiguracoesRouter.patch('/:empresaId', async (c) => {
  const user = c.get('user') as { id: string };
  const empresaId = c.req.param('empresaId');

  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json();
  const campos: Record<string, unknown> = {};
  for (const chave of CAMPOS_VALIDOS) {
    if (body[chave] !== undefined) campos[chave] = body[chave];
  }
  if (campos.raio_borda !== undefined && !RAIOS_VALIDOS.includes(campos.raio_borda as string)) {
    return c.json({ error: 'raio_borda_invalido', message: `deve ser um de: ${RAIOS_VALIDOS.join(', ')}` }, 400);
  }
  if (campos.modo_tema !== undefined && !MODOS_VALIDOS.includes(campos.modo_tema as string)) {
    return c.json({ error: 'modo_tema_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` }, 400);
  }
  if (Object.keys(campos).length === 0) {
    return c.json({ error: 'nenhum_campo_valido' }, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_configuracoes')
    .update(campos)
    .eq('empresa_id', empresaId)
    .select()
    .single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
});
