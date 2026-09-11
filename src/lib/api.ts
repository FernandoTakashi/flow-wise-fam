// Cliente da camada de API própria (/api/v1). Anexa o token do Supabase Auth.
// Enquanto a migração não termina, os chamadores caem no Supabase direto se
// a API falhar.
import { supabase } from '@/lib/supabase';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ApiError'; }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new ApiError(401, 'sem sessão');

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
      authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    let detail = res.statusText;
    // `detail` = mensagem amigável (ex.: erro da trigger do banco); `error` = código curto.
    try { const body = await res.json(); detail = body?.detail ?? body?.error ?? detail; } catch { /* ignora */ }
    throw new ApiError(res.status, detail);
  }
  return res.json() as Promise<T>;
}
