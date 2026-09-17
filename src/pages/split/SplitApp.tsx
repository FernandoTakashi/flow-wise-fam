// Roteador do "Dividir" — de propósito fora do <Layout>/<FinanceProvider> da
// carteira: precisa funcionar pra visitante sem sessão nenhuma (convite) e
// não deve carregar nada de wallet/conta.
import { Routes, Route } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import SplitGroups from './SplitGroups';
import SplitGroupDetail from './SplitGroupDetail';
import SplitInvite from './SplitInvite';

export default function SplitApp({ session }: { session: Session | null }) {
  return (
    <Routes>
      <Route path="/dividir" element={<SplitGroups session={session} />} />
      <Route path="/dividir/convite/:inviteId" element={<SplitInvite session={session} />} />
      <Route path="/dividir/:groupId" element={<SplitGroupDetail session={session} />} />
    </Routes>
  );
}
