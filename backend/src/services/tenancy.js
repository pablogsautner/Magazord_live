import { getSupabase } from './supabase.js';

export async function empresasDoUsuario(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('membros').select('empresa_id').eq('user_id', userId);
  if (error) throw error;
  return data.map((m) => m.empresa_id);
}

// Usado no "criar live": se o usuário só pertence a uma empresa, resolve sozinho —
// evita expor empresa_id na tela enquanto não existir seletor de empresa no front.
export async function empresaUnicaDoUsuario(userId) {
  const empresas = await empresasDoUsuario(userId);
  if (empresas.length !== 1) return null;
  return empresas[0];
}

export async function usuarioPertenceAEmpresa(userId, empresaId) {
  const empresas = await empresasDoUsuario(userId);
  return empresas.includes(empresaId);
}

export async function empresaIdDaLive(liveId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('lives').select('empresa_id').eq('id', liveId).single();
  if (error) throw error;
  return data.empresa_id;
}

export async function empresaIdDoLiveProduct(liveProductId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('live_products')
    .select('live_id, lives(empresa_id)')
    .eq('id', liveProductId)
    .single();
  if (error) throw error;
  return data.lives.empresa_id;
}

export async function empresaIdDoComentario(comentarioId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('comentarios')
    .select('live_id, lives(empresa_id)')
    .eq('id', comentarioId)
    .single();
  if (error) throw error;
  return data.lives.empresa_id;
}
