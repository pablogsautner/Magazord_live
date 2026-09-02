import { Router } from 'express';
import { getSupabase } from '../services/supabase.js';
import { requireUser } from '../middleware/requireUser.js';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin.js';
import { encrypt } from '../services/crypto.js';
import { TEMA_PADRAO_CLARO, TEMA_PADRAO_ESCURO } from '../services/temas.js';

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

  // Cria a config e os 2 temas (claro/escuro) padrão junto — sem isso a tela
  // de configurações da empresa não teria nenhuma linha pra ler/editar até
  // alguém salvar algo primeiro.
  await supabase.from('empresa_configuracoes').insert({ empresa_id: data.id, nome_loja: nome });
  await supabase.from('empresa_temas').insert([
    { empresa_id: data.id, modo: 'claro', ...TEMA_PADRAO_CLARO },
    { empresa_id: data.id, modo: 'escuro', ...TEMA_PADRAO_ESCURO },
  ]);

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
