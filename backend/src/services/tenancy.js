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

// % de desconto no Pix configurado pela empresa (0 se não configurado) —
// usado em toda chamada que recalcula preço na Magazord (o desconto de Pix
// não vem de nenhum endpoint deles, é cadastro nosso). Ver empresaConfiguracoes.js.
export async function descontoPixDaEmpresa(empresaId) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('empresa_configuracoes')
    .select('desconto_pix_percentual')
    .eq('empresa_id', empresaId)
    .single();
  return data?.desconto_pix_percentual ?? 0;
}

// URL de forward RTMP pronta (server_url + stream_key já concatenados) se a
// live tiver multicanal (simulcast) configurado, senão null. Ver
// mintPublishToken/POST /:liveId/publish-token.
export async function destinoMulticanalDaLive(liveId) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('lives')
    .select('multicanal_rtmp_server_url, multicanal_rtmp_stream_key')
    .eq('id', liveId)
    .single();
  const serverUrl = data?.multicanal_rtmp_server_url;
  const streamKey = data?.multicanal_rtmp_stream_key;
  return serverUrl && streamKey ? `${serverUrl}/${streamKey}` : null;
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
