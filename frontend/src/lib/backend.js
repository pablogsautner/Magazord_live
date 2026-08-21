import { supabase } from './supabase.js';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

// Anexa o token da sessão real do Supabase Auth — o backend confere esse
// token (em vez de uma chave fixa) pra saber quem está chamando.
export async function backendFetch(path, options = {}) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  return fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
}
