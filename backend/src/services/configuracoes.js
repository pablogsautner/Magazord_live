import { getSupabase } from './supabase.js';
import { encrypt, decrypt } from './crypto.js';

let cache = null;
let cacheEm = 0;
const TTL_MS = 60_000;

async function carregarTudo() {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('configuracoes').select('*');
  if (error) throw error;

  const mapa = {};
  for (const linha of data) {
    mapa[linha.chave] = linha.criptografado ? decrypt(linha.valor) : linha.valor;
  }
  return mapa;
}

// Cache simples em memória (1min) — evita ida ao banco em toda chamada que
// precisa de uma config, sem precisar reiniciar o processo pra pegar mudança.
export async function getConfiguracao(chave, valorPadrao = null) {
  if (!cache || Date.now() - cacheEm > TTL_MS) {
    cache = await carregarTudo();
    cacheEm = Date.now();
  }
  return cache[chave] ?? valorPadrao;
}

export async function setConfiguracao(chave, valor, criptografado = false) {
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
  return data.map((linha) => ({
    chave: linha.chave,
    valor: linha.criptografado ? null : linha.valor,
    definida: linha.valor != null && linha.valor !== '',
    criptografado: linha.criptografado,
    atualizado_em: linha.atualizado_em,
  }));
}
