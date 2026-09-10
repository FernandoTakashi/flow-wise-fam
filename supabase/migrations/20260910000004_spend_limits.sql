-- Limites rígidos (enforçados no banco, como o fechamento de período):
--   1. compra no cartão não pode ultrapassar o limite;
--   2. saída de conta de dinheiro não pode deixar o saldo negativo
--      (inclui o pagamento de fatura — a perna de transferência que sai da conta).
-- Só barra INSERT ou UPDATE que PIORA (aumenta valor / troca conta / efetiva
-- pendente), pra dar pra consertar dados antigos e recategorizar livremente.
-- Escape hatch: `set local carewallet.skip_checks = 'on'` (clone_wallet, imports).
begin;

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

  -- 1. cartão: comprometido nas faturas em aberto + esta compra <= limite
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

  -- 2. conta de dinheiro: saldo (opening + Σ movimentos cleared) - esta saída >= 0
  if acc.kind <> 'card' and new.kind in ('expense', 'transfer') then
    select acc.opening_balance_cents
         + coalesce(sum(case when t.kind = 'income' then t.amount_cents else -t.amount_cents end), 0)
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

drop trigger if exists trg_transactions_spend_limits on public.transactions;
create trigger trg_transactions_spend_limits
  before insert or update on public.transactions
  for each row execute function public.enforce_spend_limits();

commit;
