// Open Finance (Pluggy / Meu Pluggy) — Ajustes › Integrações. Fase 1, só
// leitura: conecta o item da Pluggy pelo ID, mostra status/consentimento,
// liga cada conta do banco a uma conta da carteira e compara o saldo do banco
// com o que o app calcula. Nenhum lançamento é criado aqui.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { apiFetch } from '@/lib/api';
import { formatBRL } from '@/lib/money';
import { formatFullDate } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Landmark, RefreshCw, Plus, CreditCard, Wallet as WalletIcon } from 'lucide-react';

interface BankConnection {
  id: string;
  external_item_id: string;
  status: string | null;
  execution_status: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  error_code: string | null;
}

interface BankAccount {
  id: string;
  connection_id: string;
  name: string;
  type: 'BANK' | 'CREDIT';
  subtype: string | null;
  number: string | null;
  balance_cents: number | null;
  credit_limit_cents: number | null;
  available_cents: number | null;
  due_date: string | null;
  account_id: string | null;
}

interface BankState { configured: boolean; connections: BankConnection[]; accounts: BankAccount[] }

const NONE = '__none__';

const STATUS_LABEL: Record<string, { label: string; tone: 'ok' | 'warn' | 'bad' }> = {
  UPDATED: { label: 'Atualizado', tone: 'ok' },
  UPDATING: { label: 'Atualizando…', tone: 'warn' },
  OUTDATED: { label: 'Desatualizado', tone: 'warn' },
  WAITING_USER_INPUT: { label: 'Aguardando ação', tone: 'warn' },
  LOGIN_ERROR: { label: 'Autorização expirada', tone: 'bad' },
};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

const daysUntil = (iso: string) => Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);

export function BankConnections() {
  const { walletId, role, accounts, accountBalanceCents, cardCommittedCents } = useFinance();
  const { toast } = useToast();
  const isOwner = role === 'owner';

  const [state, setState] = useState<BankState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [itemId, setItemId] = useState('');

  const load = useCallback(async () => {
    if (!walletId) return;
    try {
      setState(await apiFetch<BankState>(`/bank?wallet=${encodeURIComponent(walletId)}`));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [walletId]);

  useEffect(() => { void load(); }, [load]);

  const post = async (payload: Record<string, unknown>, okTitle?: string) => {
    if (!walletId) return;
    setBusy(true);
    try {
      setState(await apiFetch<BankState>('/bank', { method: 'POST', body: JSON.stringify({ walletId, ...payload }) }));
      if (okTitle) toast({ title: okTitle });
      return true;
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
      return false;
    } finally { setBusy(false); }
  };

  const connect = async () => {
    if (await post({ action: 'connect', itemId: itemId.trim() }, 'Banco conectado')) setItemId('');
  };

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);

  return (
    <Card className="max-w-xl">
      <CardHeader className="p-[22px] pb-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#E7F2F1] text-accent">
              <Landmark className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-[15.5px] font-bold">Bancos (Open Finance)</CardTitle>
              <p className="text-[12px] text-muted-foreground">Saldos reais do banco, via Meu Pluggy</p>
            </div>
          </div>
          {state && state.connections.length > 0 && (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => post({ action: 'refresh' }, 'Saldos atualizados')}>
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', busy && 'animate-spin')} /> Atualizar
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-[22px] pt-0 text-sm">
        {loadError ? (
          <div className="rounded-[12px] border border-[#F2C98A] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
            Não deu pra carregar as conexões: {loadError}
          </div>
        ) : !state ? (
          <div className="h-10 animate-pulse rounded-[12px] bg-muted" />
        ) : (
          <>
            {!state.configured && (
              <div className="rounded-[12px] border border-[#F2C98A] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
                Falta definir <code>PLUGGY_CLIENT_ID</code> e <code>PLUGGY_CLIENT_SECRET</code> no servidor.
              </div>
            )}

            {state.connections.map((c) => {
              const accs = state.accounts.filter((a) => a.connection_id === c.id);
              const label = accs.find((a) => a.type === 'BANK')?.name ?? accs[0]?.name ?? 'Banco';
              const st = STATUS_LABEL[c.status ?? ''] ?? { label: c.status ?? '—', tone: 'warn' as const };
              const days = c.consent_expires_at ? daysUntil(c.consent_expires_at) : null;
              return (
                <div key={c.id} className="space-y-2 rounded-[12px] border border-[#EAE1DA] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{label}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {c.last_synced_at ? `Banco sincronizado em ${fmtDateTime(c.last_synced_at)}` : 'Ainda não sincronizado'}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      'shrink-0',
                      st.tone === 'ok' && 'border-[#DCEDE7] bg-[#F4F9F7] text-[#1F6B67]',
                      st.tone === 'warn' && 'border-[#F2C98A] bg-[#FBF3E6] text-[#8A5A12]',
                      st.tone === 'bad' && 'border-destructive/40 bg-destructive/10 text-destructive',
                    )}>{st.label}</Badge>
                  </div>

                  {c.consent_expires_at && (
                    <p className={cn('text-[11.5px]', days != null && days <= 30 ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                      Autorização vale até {formatFullDate(c.consent_expires_at.slice(0, 10))}
                      {days != null && days <= 30 && ` — renove no Meu Pluggy (faltam ${Math.max(0, days)} dias)`}
                    </p>
                  )}

                  <div className="space-y-2">
                    {accs.map((ba) => (
                      <BankAccountRow
                        key={ba.id}
                        ba={ba}
                        isOwner={isOwner}
                        busy={busy}
                        options={activeAccounts.filter((a) => (a.kind === 'card') === (ba.type === 'CREDIT'))}
                        appCents={ba.account_id
                          ? (ba.type === 'CREDIT' ? cardCommittedCents(ba.account_id) : accountBalanceCents(ba.account_id))
                          : null}
                        onLink={(accountId) => post({ action: 'link', bankAccountId: ba.id, accountId })}
                      />
                    ))}
                  </div>

                  {isOwner && (
                    <ConfirmDialog
                      trigger={(
                        <button type="button" disabled={busy}
                          className="text-[12px] font-semibold text-[#7E6E66] hover:text-foreground">
                          Remover conexão
                        </button>
                      )}
                      title="Remover conexão?"
                      description="Remove o banco só daqui do app (as contas da carteira e os lançamentos não mudam). Para revogar o acesso de verdade, faça isso no Meu Pluggy."
                      confirmLabel="Remover"
                      onConfirm={async () => { await post({ action: 'disconnect', connectionId: c.id }, 'Conexão removida'); }}
                    />
                  )}
                </div>
              );
            })}

            {isOwner ? (
              <div className="space-y-2">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">Conectar banco</p>
                <div className="flex gap-2">
                  <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="ID do item (xxxxxxxx-xxxx-…)"
                    className="h-[38px] rounded-[10px] font-mono text-[12.5px]" />
                  <Button className="h-[38px] shrink-0" disabled={busy || !itemId.trim() || !state.configured} onClick={connect}>
                    <Plus className="mr-1.5 h-4 w-4" /> Conectar
                  </Button>
                </div>
                <p className="text-[11.5px] text-[#7E6E66]">
                  Autorize o banco em <strong>meu.pluggy.ai</strong>, conecte o MeuPluggy no Dashboard da Pluggy
                  (Aplicações → Demo → Conectar Conta) e copie o ID do item em “Itens Conectados”.
                </p>
              </div>
            ) : state.connections.length === 0 && (
              <p className="text-[12.5px] text-muted-foreground">Nenhum banco conectado. Só o dono da carteira pode conectar.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BankAccountRow({ ba, isOwner, busy, options, appCents, onLink }: {
  ba: BankAccount;
  isOwner: boolean;
  busy: boolean;
  options: { id: string; name: string }[];
  appCents: number | null;
  onLink: (accountId: string | null) => void;
}) {
  const isCard = ba.type === 'CREDIT';
  const bankCents = ba.balance_cents ?? 0;
  const diff = appCents == null ? null : bankCents - appCents;
  const Icon = isCard ? CreditCard : WalletIcon;

  return (
    <div className="rounded-[10px] bg-[#FDFAF8] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#7E6E66]" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-medium">
              {ba.name}{ba.number && <span className="text-muted-foreground"> ••{ba.number}</span>}
            </div>
            <div className="text-[11.5px] text-muted-foreground">
              {isCard
                ? `Usado ${formatBRL(bankCents)}${ba.credit_limit_cents != null ? ` de ${formatBRL(ba.credit_limit_cents)}` : ''}`
                : `Saldo no banco ${formatBRL(bankCents)}`}
            </div>
          </div>
        </div>
        {diff != null && (
          <Badge variant="outline" className={cn('shrink-0',
            Math.abs(diff) < 1 ? 'border-[#DCEDE7] bg-[#F4F9F7] text-[#1F6B67]' : 'border-[#F2C98A] bg-[#FBF3E6] text-[#8A5A12]')}>
            {Math.abs(diff) < 1 ? 'Bate com o app' : `Diferença ${diff > 0 ? '+' : '−'}${formatBRL(Math.abs(diff))}`}
          </Badge>
        )}
      </div>

      {appCents != null && (
        <div className="mt-1 pl-6 text-[11.5px] text-muted-foreground">
          No app: {isCard ? 'comprometido' : 'saldo'} {formatBRL(appCents)}
        </div>
      )}

      <div className="mt-2 pl-6">
        <Select
          value={ba.account_id ?? NONE}
          disabled={!isOwner || busy}
          onValueChange={(v) => onLink(v === NONE ? null : v)}
        >
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder={isCard ? 'Ligar a um cartão' : 'Ligar a uma conta'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Não ligar</SelectItem>
            {options.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
