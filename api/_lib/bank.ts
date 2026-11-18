// Open Finance (Pluggy) — sincroniza conexão e contas do banco com o banco de
// dados. Fase 1: só leitura (status do item + saldos), nenhum lançamento.
// Reaproveitável pelo endpoint /api/v1/bank e, depois, pelo cron.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getItem, listAccounts, pluggyCents } from './pluggy.js';
import { credsForConnection } from './pluggyCreds.js';

export interface BankConnectionRow {
  id: string;
  wallet_id: string;
  external_item_id: string;
  /** credencial da Pluggy da pessoa que conectou (null = a do servidor) */
  credential_id?: string | null;
}

/** Só os 4 últimos dígitos — o app não precisa (nem deve guardar) o número inteiro. */
const last4 = (n: string | null | undefined): string | null => {
  const digits = (n ?? '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : null;
};

/** Relê o item e as contas na Pluggy e grava status/saldos. */
export async function syncConnection(db: SupabaseClient, conn: BankConnectionRow): Promise<void> {
  const creds = await credsForConnection(db, conn.credential_id);
  const [item, accounts] = await Promise.all([getItem(creds, conn.external_item_id), listAccounts(creds, conn.external_item_id)]);
  const now = new Date().toISOString();

  const upd = await db.from('bank_connections').update({
    status: item.status,
    execution_status: item.executionStatus ?? null,
    consent_expires_at: item.consentExpiresAt ?? null,
    last_synced_at: item.lastUpdatedAt ?? null,
    error_code: item.error?.code ?? null,
    updated_at: now,
  }).eq('id', conn.id);
  if (upd.error) throw upd.error;

  if (accounts.length === 0) return;
  // upsert por external_account_id — preserva o vínculo (account_id) já feito
  const rows = accounts.map((a) => ({
    wallet_id: conn.wallet_id,
    connection_id: conn.id,
    external_account_id: a.id,
    // marketingName às vezes vem genérico ("OUTROS"); o name é mais confiável
    name: a.name || a.marketingName || 'Conta',
    type: a.type,
    subtype: a.subtype ?? null,
    number: last4(a.number),
    balance_cents: pluggyCents(a.balance),
    credit_limit_cents: pluggyCents(a.creditData?.creditLimit),
    available_cents: pluggyCents(a.creditData?.availableCreditLimit),
    due_date: a.creditData?.balanceDueDate ? a.creditData.balanceDueDate.slice(0, 10) : null,
    refreshed_at: now,
  }));
  const ups = await db.from('bank_accounts').upsert(rows, { onConflict: 'external_account_id' });
  if (ups.error) throw ups.error;
}
