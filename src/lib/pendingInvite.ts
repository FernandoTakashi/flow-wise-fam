// Guarda o convite do "Dividir" que a pessoa estava tentando abrir quando
// escolheu "Entrar"/"Criar conta" em vez de continuar como visitante — só
// pra ela voltar exatamente pro convite depois do login/cadastro (que pode
// levar até alguns minutos, se precisar confirmar e-mail).
const KEY = 'carewallet.pendingSplitInvite';

export function savePendingInvite(inviteId: string): void {
  try { localStorage.setItem(KEY, inviteId); } catch { /* localStorage indisponível — segue sem lembrar */ }
}

export function takePendingInvite(): string | null {
  try {
    const id = localStorage.getItem(KEY);
    if (id) localStorage.removeItem(KEY);
    return id;
  } catch {
    return null;
  }
}
