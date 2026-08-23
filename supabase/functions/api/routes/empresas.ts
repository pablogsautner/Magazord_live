import { Hono } from 'npm:hono@4';
import { getSupabase } from '../services/supabase.ts';
import { requireUser } from '../middleware/requireUser.ts';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.ts';
import { encrypt } from '../services/crypto.ts';

export const empresasRouter = new Hono();
empresasRouter.use('*', requireUser, requireSuperAdmin);

const COLUNAS_PUBLICAS =
  'id, nome, magazord_base_url, magazord_user, magazord_tabela_preco_id, magazord_loja_id, magazord_storefront_url, ativa, created_at';

empresasRouter.get('/', async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .select(COLUNAS_PUBLICAS)
    .order('created_at', { ascending: false });
  if (error) return c.json({ error: 'query_failed', message: error.message }, 500);
  return c.json(data);
});

empresasRouter.get('/:id', async (c) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .select(COLUNAS_PUBLICAS)
    .eq('id', c.req.param('id'))
    .single();
  if (error) return c.json({ error: 'empresa_nao_encontrada', message: error.message }, 404);
  return c.json(data);
});

empresasRouter.post('/', async (c) => {
  const {
    nome,
    magazord_base_url,
    magazord_user,
    magazord_password,
    magazord_tabela_preco_id,
    magazord_loja_id,
    magazord_storefront_url,
  } = await c.req.json();

  if (!nome || !magazord_base_url || !magazord_user || !magazord_password || !magazord_storefront_url) {
    return c.json({ error: 'campos_obrigatorios_faltando' }, 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .insert({
      nome,
      magazord_base_url,
      magazord_user,
      magazord_password: encrypt(magazord_password),
      magazord_tabela_preco_id: magazord_tabela_preco_id || '1',
      magazord_loja_id: magazord_loja_id || '1',
      magazord_storefront_url,
    })
    .select(COLUNAS_PUBLICAS)
    .single();
  if (error) return c.json({ error: 'insert_failed', message: error.message }, 500);

  // Cria a config padrão junto — sem isso a tela de configurações da empresa
  // não teria nenhuma linha pra ler/editar até alguém salvar algo primeiro.
  await supabase.from('empresa_configuracoes').insert({ empresa_id: (data as any).id, nome_loja: nome });

  return c.json(data, 201);
});

empresasRouter.patch('/:id', async (c) => {
  const body = await c.req.json();
  const campos: Record<string, unknown> = {};
  for (const chave of [
    'nome',
    'magazord_base_url',
    'magazord_user',
    'magazord_password',
    'magazord_tabela_preco_id',
    'magazord_loja_id',
    'magazord_storefront_url',
    'ativa',
  ]) {
    if (body[chave] !== undefined) campos[chave] = body[chave];
  }
  if (campos.magazord_password !== undefined) {
    campos.magazord_password = encrypt(campos.magazord_password as string);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .update(campos)
    .eq('id', c.req.param('id'))
    .select(COLUNAS_PUBLICAS)
    .single();
  if (error) return c.json({ error: 'update_failed', message: error.message }, 500);
  return c.json(data);
});

empresasRouter.delete('/:id', async (c) => {
  const supabase = getSupabase();
  const { error } = await supabase.from('empresas').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: 'delete_failed', message: error.message }, 500);
  return c.body(null, 204);
});
