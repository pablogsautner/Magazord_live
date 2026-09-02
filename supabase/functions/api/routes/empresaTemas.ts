import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaUnicaDoUsuario, usuarioPertenceAEmpresa } from '../services/tenancy.ts';
import { TEMA_PADRAO_CLARO, TEMA_PADRAO_ESCURO } from '../services/temas.ts';

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

// O front não tem como descobrir seu próprio empresa_id sozinho (membros/
// empresas não têm policy de leitura pro cliente), então resolve aqui do
// mesmo jeito que POST /lives já faz, e devolve os 2 modos de uma vez.
empresaTemasRouter.get('/me', async (c) => {
  const user = c.get('user') as { id: string };
  const empresaId = await empresaUnicaDoUsuario(user.id);
  if (!empresaId) return c.json({ error: 'empresa_nao_encontrada' }, 404);

  const supabase = getSupabase();
  const { data, error } = await supabase.from('empresa_temas').select().eq('empresa_id', empresaId);
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);

  // Fallback pra paleta padrão da plataforma se faltar linha — não deveria
  // acontecer (POST /empresas sempre cria os 2 modos na hora), mas cobre
  // dado legado/incompleto em vez de devolver 404 e travar a tela de edição.
  const lista = data as any[];
  const claro = lista.find((tema) => tema.modo === 'claro') ?? { empresa_id: empresaId, modo: 'claro', ...TEMA_PADRAO_CLARO };
  const escuro = lista.find((tema) => tema.modo === 'escuro') ?? { empresa_id: empresaId, modo: 'escuro', ...TEMA_PADRAO_ESCURO };

  return c.json({ empresa_id: empresaId, claro, escuro });
});

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
