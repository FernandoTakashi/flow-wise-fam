// Open Finance (Pluggy / Meu Pluggy) — Ajustes › Integrações.
// Cada membro cadastra a PRÓPRIA credencial da Pluggy (no plano pessoal cada
// titular tem a sua aplicação) e conecta os próprios bancos. Cada conta do
// banco é ligada a uma conta da carteira (ou cria uma nova) e, com a data de
// corte, os lançamentos daquela conta passam a vir só do banco.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { apiFetch } from '@/lib/api';
import { formatBRL } from '@/lib/money';
import { formatFullDate, todayISO } from '@/lib/dates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Landmark, RefreshCw, Plus, CreditCard, Wallet as WalletIcon, KeyRound } from 'lucide-react';

interface BankConnection {
  id: string;
  external_item_id: string;
  status: string | null;
  execution_status: string | null;
  consent_expires_at: string | null;
  last_synced_at: string | null;
  error_code: string | null;
  created_by: string | null;
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
  import_from: string | null;
  last_import_at: string | null;
}

interface BankState {
  serverConfigured: boolean;
  credsKeyConfigured: boolean;
  myCredentials: { clientIdHint: string; updatedAt: string } | null;
  connections: BankConnection[];
  accounts: BankAccount[];
}

interface ImportSummary {
  created: number; updated: number; deleted: number; errors: string[]; accounts: number;
  fixosLinked?: number; invoicesPaid?: number;
}

const NONE = '__none__';
const NEW = '__new__';

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
  const { walletId, userId, role, accounts, accountBalanceCents, cardCommittedCents, memberName, reload } = useFinance();
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

  const post = async (payload: Record<string, unknown>, okTitle?: string, reloadFinance = false) => {
    if (!walletId) return false;
    setBusy(true);
    try {
      setState(await apiFetch<BankState>('/bank', { method: 'POST', body: JSON.stringify({ walletId, ...payload }) }));
      if (reloadFinance) await reload();
      if (okTitle) toast({ title: okTitle });
      return true;
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
      return false;
    } finally { setBusy(false); }
  };

  const runImport = async () => {
    if (!walletId) return;
    setBusy(true);
    try {
      const r = await apiFetch<BankState & { import: ImportSummary }>('/bank', {
        method: 'POST', body: JSON.stringify({ walletId, action: 'import' }),
      });
      setState(r);
      await reload();
      const { created, updated, deleted, errors, fixosLinked = 0, invoicesPaid = 0 } = r.import;
      const extras = [
        fixosLinked ? `${fixosLinked} fixo${fixosLinked > 1 ? 's' : ''} ligado${fixosLinked > 1 ? 's' : ''}` : '',
        invoicesPaid ? `${invoicesPaid} fatura${invoicesPaid > 1 ? 's' : ''} paga${invoicesPaid > 1 ? 's' : ''}` : '',
      ].filter(Boolean).join(', ');
      toast({
        title: 'Lançamentos do banco importados',
        description: `${created} novos, ${updated} atualizados, ${deleted} removidos${extras ? ` · ${extras}` : ''}`
          + `${errors.length ? ` · ${errors.length} com erro: ${errors[0]}` : ''}`,
        variant: errors.length ? 'destructive' : undefined,
      });
    } catch (e) {
      toast({ title: 'Erro', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const connect = async () => {
    if (await post({ action: 'connect', itemId: itemId.trim() }, 'Banco conectado')) setItemId('');
  };

  const activeAccounts = useMemo(() => accounts.filter((a) => !a.archived), [accounts]);
  const canConnect = !!state && (!!state.myCredentials || (isOwner && state.serverConfigured));
  const hasCutoff = !!state?.accounts.some((a) => a.account_id && a.import_from);

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
              <p className="text-[12px] text-muted-foreground">Lançamentos e saldos direto do banco, via Meu Pluggy</p>
            </div>
          </div>
          {state && state.connections.length > 0 && (
            <Button size="sm" variant="outline" disabled={busy}
              onClick={hasCutoff ? runImport : () => post({ action: 'refresh' }, 'Saldos atualizados')}>
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', busy && 'animate-spin')} /> {hasCutoff ? 'Importar do banco' : 'Atualizar'}
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
            {state.connections.map((c) => {
              const accs = state.accounts.filter((a) => a.connection_id === c.id);
              const label = accs.find((a) => a.type === 'BANK')?.name ?? accs[0]?.name ?? 'Banco';
              const st = STATUS_LABEL[c.status ?? ''] ?? { label: c.status ?? '—', tone: 'warn' as const };
              const days = c.consent_expires_at ? daysUntil(c.consent_expires_at) : null;
              const canManage = isOwner || c.created_by === userId;
              return (
                <div key={c.id} className="space-y-2 rounded-[12px] border border-[#EAE1DA] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold">{label}</div>
                      <div className="text-[11.5px] text-muted-foreground">
                        {c.created_by ? `De ${c.created_by === userId ? 'você' : memberName(c.created_by).split(' ')[0]} · ` : ''}
                        {c.last_synced_at ? `banco sincronizado em ${fmtDateTime(c.last_synced_at)}` : 'ainda não sincronizado'}
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
                        canManage={canManage}
                        busy={busy}
                        options={activeAccounts.filter((a) => (a.kind === 'card') === (ba.type === 'CREDIT'))}
                        appCents={ba.account_id
                          ? (ba.type === 'CREDIT' ? cardCommittedCents(ba.account_id) : accountBalanceCents(ba.account_id))
                          : null}
                        onLink={(accountId) => post({ action: 'link', bankAccountId: ba.id, accountId },
                          accountId === 'new' ? 'Conta criada e ligada ao banco' : undefined, true)}
                        onAlign={() => post({ action: 'alignBalance', bankAccountId: ba.id }, 'Saldo igualado ao do banco', true)}
                        onCutoff={(importFrom, deleteManual) => post({ action: 'setCutoff', bankAccountId: ba.id, importFrom, deleteManual },
                          'Conta passa a vir do banco — clique em "Importar do banco"', true)}
                      />
                    ))}
                  </div>

                  {canManage && (
                    <ConfirmDialog
                      trigger={(
                        <button type="button" disabled={busy}
                          className="text-[12px] font-semibold text-[#7E6E66] hover:text-foreground">
                          Remover conexão
                        </button>
                      )}
                      title="Remover conexão?"
                      description="Remove o banco só daqui do app (as contas da carteira e os lançamentos já importados ficam). Para revogar o acesso de verdade, faça isso no Meu Pluggy."
                      confirmLabel="Remover"
                      onConfirm={async () => { await post({ action: 'disconnect', connectionId: c.id }, 'Conexão removida'); }}
                    />
                  )}
                </div>
              );
            })}

            <CredentialsPanel state={state} isOwner={isOwner} busy={busy} post={post} />

            {canConnect && (
              <div className="space-y-2">
                <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">Conectar um banco seu</p>
                <div className="flex gap-2">
                  <Input value={itemId} onChange={(e) => setItemId(e.target.value)} placeholder="ID do item (xxxxxxxx-xxxx-…)"
                    className="h-[38px] rounded-[10px] font-mono text-[12.5px]" />
                  <Button className="h-[38px] shrink-0" disabled={busy || !itemId.trim()} onClick={connect}>
                    <Plus className="mr-1.5 h-4 w-4" /> Conectar
                  </Button>
                </div>
                <p className="text-[11.5px] text-[#7E6E66]">
                  Autorize o banco em <strong>meu.pluggy.ai</strong>, conecte o MeuPluggy no Dashboard da Pluggy
                  (Aplicações → Demo → Conectar Conta) e copie o ID do item em “Itens Conectados”.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/** Credencial da Pluggy de quem está vendo (cada pessoa usa a sua). */
function CredentialsPanel({ state, isOwner, busy, post }: {
  state: BankState;
  isOwner: boolean;
  busy: boolean;
  post: (payload: Record<string, unknown>, okTitle?: string) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const usingServer = !state.myCredentials && isOwner && state.serverConfigured;

  const save = async () => {
    if (await post({ action: 'saveCredentials', clientId: clientId.trim(), clientSecret: clientSecret.trim() }, 'Credencial da Pluggy salva')) {
      setClientId(''); setClientSecret(''); setEditing(false);
    }
  };

  return (
    <div className="space-y-2 rounded-[12px] bg-[#FDFAF8] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#7E6E66]" />
          <div className="min-w-0 text-[12.5px]">
            <div className="font-semibold">Sua credencial da Pluggy</div>
            <div className="text-[11.5px] text-muted-foreground">
              {state.myCredentials
                ? `Cadastrada · Client ID ${state.myCredentials.clientIdHint}`
                : usingServer
                  ? 'Usando a credencial configurada no servidor.'
                  : 'Cada pessoa conecta os próprios bancos com a própria conta do Meu Pluggy.'}
            </div>
          </div>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-3">
            <button type="button" disabled={busy} onClick={() => setEditing(true)}
              className="text-[12px] font-semibold text-accent hover:underline">
              {state.myCredentials ? 'Trocar' : 'Cadastrar'}
            </button>
            {state.myCredentials && (
              <button type="button" disabled={busy} onClick={() => post({ action: 'deleteCredentials' }, 'Credencial removida')}
                className="text-[12px] font-semibold text-[#7E6E66] hover:text-foreground">
                Remover
              </button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="space-y-2 pl-6">
          {!state.credsKeyConfigured && (
            <p className="text-[11.5px] text-[#8A5A12]">O servidor ainda não está pronto para guardar credenciais (falta PLUGGY_CREDENTIALS_KEY).</p>
          )}
          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="Client ID"
            autoComplete="off" className="h-9 font-mono text-[12.5px]" />
          <Input value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} placeholder="Client Secret"
            type="password" autoComplete="new-password" className="h-9 font-mono text-[12.5px]" />
          <p className="text-[11px] text-muted-foreground">
            No Dashboard da Pluggy → Aplicações. O secret é guardado cifrado e nunca volta pro app.
          </p>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !clientId.trim() || !clientSecret.trim() || !state.credsKeyConfigured} onClick={save}>Salvar</Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setEditing(false); setClientId(''); setClientSecret(''); }}>Cancelar</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BankAccountRow({ ba, canManage, busy, options, appCents, onLink, onAlign, onCutoff }: {
  ba: BankAccount;
  canManage: boolean;
  busy: boolean;
  options: { id: string; name: string }[];
  appCents: number | null;
  onLink: (accountId: string | null) => void;
  onAlign: () => void;
  onCutoff: (importFrom: string, deleteManual: boolean) => void;
}) {
  const isCard = ba.type === 'CREDIT';
  const bankCents = ba.balance_cents ?? 0;
  const diff = appCents == null ? null : bankCents - appCents;
  const Icon = isCard ? CreditCard : WalletIcon;
  const [cutoffOpen, setCutoffOpen] = useState(false);
  const [cutoff, setCutoff] = useState(`${todayISO().slice(0, 7)}-01`);
  const [deleteManual, setDeleteManual] = useState(true);

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
        <div className="mt-1 flex flex-wrap items-center gap-x-2 pl-6 text-[11.5px] text-muted-foreground">
          <span>No app: {isCard ? 'comprometido' : 'saldo'} {formatBRL(appCents)}</span>
          {!isCard && canManage && diff != null && Math.abs(diff) >= 1 && (
            <button type="button" disabled={busy} onClick={onAlign} className="font-semibold text-accent hover:underline">
              Igualar ao banco
            </button>
          )}
        </div>
      )}

      {ba.account_id && (
        <div className="mt-0.5 pl-6 text-[11.5px] text-muted-foreground">
          {ba.import_from
            ? `Lançamentos vêm do banco desde ${formatFullDate(ba.import_from)}${ba.last_import_at ? ` · última importação ${fmtDateTime(ba.last_import_at)}` : ''}`
            : (
              <span>
                Ainda manual.{' '}
                {canManage && !cutoffOpen && (
                  <button type="button" disabled={busy} onClick={() => setCutoffOpen(true)} className="font-semibold text-accent hover:underline">
                    Passar a vir do banco
                  </button>
                )}
              </span>
            )}
        </div>
      )}

      {cutoffOpen && !ba.import_from && (
        <div className="mt-2 space-y-2 rounded-[8px] border border-[#EAE1DA] bg-card p-2.5 pl-3 text-[12px]">
          <label className="flex items-center gap-2">
            <span className="text-muted-foreground">A partir de</span>
            <Input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value)} className="h-8 w-[150px] text-[12.5px]" />
          </label>
          <label className="flex items-start gap-2">
            <Checkbox checked={deleteManual} onCheckedChange={(v) => setDeleteManual(v === true)} className="mt-0.5" />
            <span>Apagar o que foi lançado à mão nesta conta a partir dessa data (o banco manda tudo de novo). Sem isso, pode duplicar.</span>
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !cutoff} onClick={() => { onCutoff(cutoff, deleteManual); setCutoffOpen(false); }}>Confirmar</Button>
            <Button size="sm" variant="ghost" onClick={() => setCutoffOpen(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      <div className="mt-2 pl-6">
        <Select
          value={ba.account_id ?? NONE}
          disabled={!canManage || busy}
          onValueChange={(v) => onLink(v === NONE ? null : v === NEW ? 'new' : v)}
        >
          <SelectTrigger className="h-8 text-[12.5px]">
            <SelectValue placeholder={isCard ? 'Ligar a um cartão' : 'Ligar a uma conta'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Não ligar</SelectItem>
            <SelectItem value={NEW}>+ Criar {isCard ? 'cartão' : 'conta'} novo no app</SelectItem>
            {options.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
