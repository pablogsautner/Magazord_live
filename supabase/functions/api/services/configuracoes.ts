import { getSupabase } from './supabase.ts';
import { encrypt, decrypt } from './crypto.ts';

let cache: Record<string, string | null> | null = null;
let cacheEm = 0;
const TTL_MS = 60_000;

async function carregarTudo() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('configuracoes').select('*');
  if (error) throw error;

  const mapa: Record<string, string | null> = {};
  for (const linha of data as any[]) {
    mapa[linha.chave] = linha.criptografado ? decrypt(linha.valor) : linha.valor;
  }
  return mapa;
}

// Cache simples em memória (1min) — evita ida ao banco em toda chamada que
// precisa de uma config, sem precisar reiniciar o processo pra pegar mudança.
export async function getConfiguracao(chave: string, valorPadrao: string | null = null) {
  if (!cache || Date.now() - cacheEm > TTL_MS) {
    cache = await carregarTudo();
    cacheEm = Date.now();
  }
  return cache[chave] ?? valorPadrao;
}

export async function setConfiguracao(chave: string, valor: string, criptografado = false) {
  const supabase = getSupabase();
  const valorSalvo = criptografado ? encrypt(valor) : valor;
  const { error } = await supabase
    .from('configuracoes')
    .upsert({ chave, valor: valorSalvo, criptografado, atualizado_em: new Date().toISOString() });
  if (error) throw error;
  cache = null;
}

// Nunca devolve o valor de configs criptografadas — só confirma que existem.
export async function listarConfiguracoes() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('configuracoes')
    .select('chave, valor, criptografado, atualizado_em')
    .order('chave');
  if (error) throw error;
  return (data as any[]).map((linha) => ({
    chave: linha.chave,
    valor: linha.criptografado ? null : linha.valor,
    definida: linha.valor != null && linha.valor !== '',
    criptografado: linha.criptografado,
    atualizado_em: linha.atualizado_em,
  }));
}
