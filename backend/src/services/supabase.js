import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

let client;

// Lazy: assim o backend sobe mesmo sem SUPABASE_URL configurado ainda
// (útil pra testar só o proxy da Magazord antes de plugar o Supabase).
export function getSupabase() {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
