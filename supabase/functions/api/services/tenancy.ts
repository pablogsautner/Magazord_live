import { getSupabase } from './supabase.ts';

export async function empresasDoUsuario(userId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('membros').select('empresa_id').eq('user_id', userId);
  if (error) throw error;
  return data.map((m: any) => m.empresa_id);
}

export async function empresaUnicaDoUsuario(userId: string) {
  const empresas = await empresasDoUsuario(userId);
  if (empresas.length !== 1) return null;
  return empresas[0];
}

export async function usuarioPertenceAEmpresa(userId: string, empresaId: string) {
  const empresas = await empresasDoUsuario(userId);
  return empresas.includes(empresaId);
}

export async function empresaIdDaLive(liveId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('lives').select('empresa_id').eq('id', liveId).single();
  if (error) throw error;
  return data.empresa_id;
}

export async function empresaIdDoLiveProduct(liveProductId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('live_products')
    .select('live_id, lives(empresa_id)')
    .eq('id', liveProductId)
    .single();
  if (error) throw error;
  return (data.lives as any).empresa_id;
}

// % de desconto no Pix configurado pela empresa (0 se não configurado) —
// usado em toda chamada que recalcula preço na Magazord (o desconto de Pix
// não vem de nenhum endpoint deles, é cadastro nosso). Ver empresaConfiguracoes.ts.
export async function descontoPixDaEmpresa(empresaId: string) {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('empresa_configuracoes')
    .select('desconto_pix_percentual')
    .eq('empresa_id', empresaId)
    .single();
  return (data as { desconto_pix_percentual?: number } | null)?.desconto_pix_percentual ?? 0;
}

export async function empresaIdDoComentario(comentarioId: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('comentarios')
    .select('live_id, lives(empresa_id)')
    .eq('id', comentarioId)
    .single();
  if (error) throw error;
  return (data.lives as any).empresa_id;
}
