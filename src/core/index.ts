// Núcleo de domínio da CaRe Wallet — funções puras de leitura, sem React nem
// Supabase. O FinanceContext e (no futuro) a API/o app mobile consomem daqui.
export type {
  FinanceData, OccurrenceView, InvoiceRow, InvoiceView, MemberSpend, MonthSummary, UUID,
} from './types';

export {
  accountBalance, cardCommitted, spendingAccounts, cards,
  accountBalanceCents, cashBalanceCents, cardCommittedCents, cardAvailableCents,
} from './balances';
export { projectedCardFixos, computeInvoiceView } from './invoices';
export { recurrenceOccurrences } from './recurrences';
export { monthSummary } from './summary';
export { spendByMember, jointSpendCents, memberBalances, settlements } from './members';
export { totalInvestedCents, investmentMonthlyYieldCents } from './investments';
export { isPeriodLocked, wouldOverdraw, wouldExceedLimit } from './guards';
export { monthTxByDate, monthTxByRef } from './transactions';
