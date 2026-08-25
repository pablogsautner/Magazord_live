import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const empresaTemasRouter = new Hono();
empresaTemasRouter.use('*', requireUser);

const CAMPOS_VALIDOS = [
  'border_radius',
  'primary_color',
  'primary_foreground',
  'primary_hover',
  'page_background',
  'card_background',
  'card_border',
  'heading_color',
  'subheading_color',
  'body_text_color',
  'badge_background',
  'badge_text',
];
const RAIOS_VALIDOS = ['none', 'sm', 'md', 'lg', 'xl'];
const MODOS_VALIDOS = ['claro', 'escuro'];

empresaTemasRouter.patch('/:empresaId/:modo', async (c) => {
  const user = c.get('user') as { id: string };
  const empresaId = c.req.param('empresaId');
  const modo = c.req.param('modo');

  if (!MODOS_VALIDOS.includes(modo)) {
    return c.json({ error: 'modo_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` }, 400);
  }
  if (!(await usuarioPertenceAEmpresa(user.id, empresaId))) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const body = await c.req.json();
  const campos: Record<string, unknown> = {};
  for (const chave of CAMPOS_VALIDOS) {
    if (body[chave] !== undefined) campos[chave] = body[chave];
  }
  if (campos.border_radius !== undefined && !RAIOS_VALIDOS.includes(campos.border_radius as string)) {
    return c.json({ error: 'border_radius_invalido', message: `deve ser um de: ${RAIOS_VALIDOS.join(', ')}` }, 400);
  }
  if (Object.keys(campos).length === 0) {
    return c.json({ error: 'nenhum_campo_valido' }, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_temas')
    .update(campos)
    .eq('empresa_id', empresaId)
    .eq('modo', modo)
    .select()
    .single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
});
