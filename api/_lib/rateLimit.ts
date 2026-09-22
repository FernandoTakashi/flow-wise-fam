// Limitador simples em memória — por instância serverless, não distribuído.
// Zera a cada cold start e não é compartilhado entre instâncias paralelas,
// então NÃO é um limitador de verdade (pra isso precisaria de Redis/Upstash
// ou Vercel KV). O que ele faz: barra abuso básico de script (enumeração de
// convite, flood) sem exigir nenhuma infra nova. Se o tráfego crescer a
// ponto de precisar de garantia real, trocar por um store externo.
const buckets = new Map<string, { count: number; resetAt: number }>();

/** true = passou do limite (bloquear); false = ainda dentro da janela. */
export function rateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();

  // limpeza oportunista pra não crescer sem limite num processo de vida longa
  if (buckets.size > 500) {
    for (const [k, b] of buckets) if (now > b.resetAt) buckets.delete(k);
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

/** IP do chamador a partir do header que a Vercel preenche (proxy confiável). */
export function clientIp(req: { headers: Record<string, string | string[] | undefined> }): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd;
  return raw?.split(',')[0]?.trim() || 'unknown';
}
