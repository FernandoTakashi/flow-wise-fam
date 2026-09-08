// Cliente Supabase com a service_role key — ignora RLS.
// Usado só pelo backend (webhook do bot + cron). NUNCA expor no frontend.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.ts';

let client: SupabaseClient | null = null;

export function admin(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl(), env.supabaseServiceRole(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
