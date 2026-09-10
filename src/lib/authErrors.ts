// Traduz erros do Supabase Auth para mensagens curtas em pt-BR.
type SupabaseAuthError = { message?: string; code?: string; status?: number } | null | undefined;

export function mapAuthError(err: SupabaseAuthError): string {
  const raw = (err?.message ?? '').toLowerCase();
  const code = err?.code ?? '';

  if (!raw && !code) return 'Algo deu errado. Tente de novo.';

  if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) {
    return 'Confirme seu e-mail antes de entrar — o link foi enviado no cadastro.';
  }
  if (code === 'user_already_exists' || raw.includes('already registered') || raw.includes('already been registered')) {
    return 'Já existe uma conta com esse e-mail. Tente entrar ou recuperar a senha.';
  }
  if (code === 'weak_password' || raw.includes('password should be at least') || raw.includes('weak password')) {
    return 'Senha fraca — use pelo menos 8 caracteres.';
  }
  if (code === 'same_password' || raw.includes('should be different from the old password')) {
    return 'A nova senha precisa ser diferente da atual.';
  }
  if (code === 'over_email_send_rate_limit' || raw.includes('rate limit') || raw.includes('too many requests') || err?.status === 429) {
    return 'Muitas tentativas em pouco tempo. Espere um minuto e tente de novo.';
  }
  if (code === 'validation_failed' || raw.includes('unable to validate email') || raw.includes('invalid email')) {
    return 'E-mail inválido.';
  }
  if (code === 'signup_disabled' || raw.includes('signups not allowed')) {
    return 'Cadastro está fechado no momento.';
  }
  if (raw.includes('failed to fetch') || raw.includes('network')) {
    return 'Sem conexão com o servidor. Verifique sua internet.';
  }
  return err?.message ?? 'Algo deu errado. Tente de novo.';
}
