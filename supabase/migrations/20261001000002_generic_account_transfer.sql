-- Transferência entre contas (sem contar como receita/despesa). A transferência
-- já existia internamente (pagar fatura de cartão = uma perna de saída + uma de
-- entrada ligadas por transfer_peer_id), mas o lado "credita o saldo" era
-- deduzido só pelo tipo da conta (`acc.kind = 'card'`) — funcionava por
-- coincidência porque a ÚNICA transferência possível ia sempre de uma conta de
-- dinheiro pro cartão. Pra permitir transferência genérica entre quaisquer duas
-- contas (ex.: conta corrente → poupança), a direção passa a vir do dado, não
-- do tipo da conta.
alter table public.transactions
  add column if not exists transfer_credit boolean not null default false;
comment on column public.transactions.transfer_credit is
  'só relevante p/ kind=transfer: true = perna de destino (credita o saldo), false = perna de origem (debita). Pagamento de fatura sempre credita o cartão.';

-- backfill: toda transferência existente até hoje é pagamento de fatura —
-- a perna no cartão é sempre quem credita.
update public.transactions set transfer_credit = true
 where kind = 'transfer' and account_id in (select id from public.accounts where kind = 'card');

-- enforce_spend_limits: credita (transfer_credit) nunca estoura saldo — só a
-- perna de origem (débito) é checada. O cálculo histórico do saldo também
-- passa a somar (não subtrair) as pernas de crédito de outras transferências.
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
