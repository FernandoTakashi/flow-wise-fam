-- Open Finance (Pluggy) — Etapa de importação: nas contas ligadas ao banco, a
-- partir da data de corte (`bank_accounts.import_from`), os lançamentos vêm
-- só do banco. O app passa a conferir e classificar.

-- id do lançamento no provedor (Pluggy) — deduplica entre sincronizações
alter table public.transactions
  add column if not exists external_source text,
  add column if not exists external_id text;
create unique index if not exists transactions_external_uidx
  on public.transactions (external_source, external_id)
  where external_id is not null;

-- data de corte por conta do banco: daqui pra frente, só o que vem do banco
alter table public.bank_accounts
  add column if not exists import_from date,
  add column if not exists last_import_at timestamptz;

-- O banco já aprovou (ou recusou) a compra: lançamento importado não passa
-- pelos limites de saldo/limite do app. Mesmo corpo da versão 20261001000002,
-- só com o desvio de source = 'import' no começo.
create or replace function public.enforce_spend_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  acc         public.accounts;
  v_committed bigint;
  v_balance   bigint;
begin
  if coalesce(current_setting('carewallet.skip_checks', true), '') = 'on' then
    return new;
  end if;
  if new.source = 'import' then
    return new;
  end if;
  if new.status <> 'cleared' then
    return new;
  end if;
  if not (
    tg_op = 'INSERT'
    or new.amount_cents > old.amount_cents
    or new.account_id  <> old.account_id
    or old.status <> 'cleared'
  ) then
    return new;
  end if;

  select * into acc from public.accounts where id = new.account_id;
  if not found then
    return new;
  end if;

  if acc.kind = 'card' and new.kind = 'expense' and acc.credit_limit_cents is not null then
    select coalesce(sum(t.amount_cents), 0) into v_committed
      from public.transactions t
      join public.card_invoices ci on ci.id = t.card_invoice_id
     where t.account_id = new.account_id
       and t.kind = 'expense'
       and ci.status <> 'paid'
       and t.id <> new.id;
    if v_committed + new.amount_cents > acc.credit_limit_cents then
      raise exception 'Limite do cartão % excedido — livre: R$ %.',
        acc.name, round((acc.credit_limit_cents - v_committed) / 100.0, 2)
        using errcode = '23514';
    end if;
  end if;

  if acc.kind <> 'card' and (new.kind = 'expense' or (new.kind = 'transfer' and not new.transfer_credit)) then
    select acc.opening_balance_cents
         + coalesce(sum(
             case when t.kind = 'income' then t.amount_cents
                  when t.kind = 'transfer' and t.transfer_credit then t.amount_cents
                  else -t.amount_cents
             end), 0)
      into v_balance
      from public.transactions t
     where t.account_id = new.account_id
       and t.status = 'cleared'
       and t.id <> new.id;
    if v_balance - new.amount_cents < 0 then
      raise exception 'Saldo insuficiente em % — disponível: R$ %.',
        acc.name, round(v_balance / 100.0, 2)
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;
