import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { encrypt } from '../services/crypto.js';

export const empresasRouter = Router();
empresasRouter.use(requireUser, requireSuperAdmin);

// magazord_password nunca volta nas respostas — é um campo write-only.
const COLUNAS_PUBLICAS =
  'id, nome, magazord_base_url, magazord_user, magazord_tabela_preco_id, magazord_loja_id, magazord_storefront_url, ativa, created_at';

empresasRouter.get('/', async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .select(COLUNAS_PUBLICAS)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'query_failed', message: error.message });
  res.json(data);
});

empresasRouter.get('/:id', async (req, res) => {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .select(COLUNAS_PUBLICAS)
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'empresa_nao_encontrada', message: error.message });
  res.json(data);
});

empresasRouter.post('/', async (req, res) => {
  const {
    nome,
    magazord_base_url,
    magazord_user,
    magazord_password,
    magazord_tabela_preco_id,
    magazord_loja_id,
    magazord_storefront_url,
  } = req.body;

  if (!nome || !magazord_base_url || !magazord_user || !magazord_password || !magazord_storefront_url) {
    return res.status(400).json({ error: 'campos_obrigatorios_faltando' });
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
  if (error) return res.status(500).json({ error: 'insert_failed', message: error.message });
  res.status(201).json(data);
});

empresasRouter.patch('/:id', async (req, res) => {
  const campos = {};
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
    if (req.body[chave] !== undefined) campos[chave] = req.body[chave];
  }
  if (campos.magazord_password !== undefined) campos.magazord_password = encrypt(campos.magazord_password);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('empresas')
    .update(campos)
    .eq('id', req.params.id)
    .select(COLUNAS_PUBLICAS)
    .single();
  if (error) return res.status(500).json({ error: 'update_failed', message: error.message });
  res.json(data);
});

empresasRouter.delete('/:id', async (req, res) => {
  const supabase = getSupabase();
  const { error } = await supabase.from('empresas').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: 'delete_failed', message: error.message });
  res.status(204).end();
});
