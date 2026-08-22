import { createClient } from 'npm:@supabase/supabase-js@2';
import { config } from '../config.ts';

let client: ReturnType<typeof createClient> | undefined;

export function getSupabase() {
  if (!client) {
    client = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
