import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { empresaUnicaDoUsuario, usuarioPertenceAEmpresa } from '../services/tenancy.ts';

export const empresaConfiguracoesRouter = new Hono();
empresaConfiguracoesRouter.use('*', requireUser);

const CAMPOS_VALIDOS = ['nome_loja', 'email_contato', 'fuso_horario', 'idioma', 'logo_url', 'modo_tema', 'desconto_pix_percentual'];
const MODOS_VALIDOS = ['claro', 'escuro', 'sistema'];

// Precisa vir antes de "/:empresaId" — senão "me" seria interpretado como um
// empresaId. O front não tem como descobrir seu próprio empresa_id sozinho
// (membros/empresas não têm policy de leitura pro cliente), então resolve
// aqui do mesmo jeito que POST /lives já faz.
empresaConfiguracoesRouter.get('/me', async (c) => {
  const user = c.get('user') as { id: string };
  const empresaId = await empresaUnicaDoUsuario(user.id);
  if (!empresaId) return c.json({ error: 'empresa_nao_encontrada' }, 404);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresa_configuracoes')
    .select()
    .eq('empresa_id', empresaId)
    .single();
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  return c.json(data);
});

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
  if (campos.modo_tema !== undefined && !MODOS_VALIDOS.includes(campos.modo_tema as string)) {
    return c.json({ error: 'modo_tema_invalido', message: `deve ser um de: ${MODOS_VALIDOS.join(', ')}` }, 400);
  }
  if (
    campos.desconto_pix_percentual !== undefined &&
    (typeof campos.desconto_pix_percentual !== 'number' || campos.desconto_pix_percentual < 0 || campos.desconto_pix_percentual > 100)
  ) {
    return c.json({ error: 'desconto_pix_percentual_invalido', message: 'deve ser um número entre 0 e 100' }, 400);
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
