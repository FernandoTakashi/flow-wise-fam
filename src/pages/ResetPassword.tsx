import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mapAuthError } from '@/lib/authErrors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import { Mascot } from '@/components/Mascot';

const FIELD = 'h-[52px] rounded-[14px] border-[#E2D7CF] bg-white text-[15px]';
const LABEL = 'text-[12.5px] font-semibold text-[#5C4C45]';

/** Tela mostrada quando o usuário chega pelo link de "redefinir senha". */
export default function ResetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { toast({ title: 'Senha muito curta', description: 'Use pelo menos 8 caracteres.', variant: 'destructive' }); return; }
    if (password !== confirm) { toast({ title: 'As senhas não conferem', variant: 'destructive' }); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: 'Não foi possível trocar a senha', description: mapAuthError(error), variant: 'destructive' });
        return;
      }
      toast({ title: 'Senha atualizada', description: 'Você já está conectado.' });
      onDone();
    } catch (err) {
      toast({ title: 'Não foi possível trocar a senha', description: mapAuthError(err as { message?: string }), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const cancel = async () => {
    // saiu da sessão de recuperação sem trocar — volta pro login
    await supabase.auth.signOut();
    onDone();
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-background px-[26px] pb-10 pt-8">
      <div className="mx-auto flex w-full max-w-sm flex-col gap-[26px]">
        <div className="flex flex-col gap-4">
          <Mascot size={60} tile className="rounded-[18px] p-[5px]" />
          <div>
            <h1 className="font-display text-[28px] font-bold leading-[1.1] tracking-[-0.02em] text-foreground">
              Defina uma nova senha
            </h1>
            <p className="mt-2 text-[14px] leading-[1.45] text-[#5C4C45]">
              Escolha uma senha nova para a sua conta. Depois disso você já entra direto.
            </p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <label htmlFor="new-password" className={LABEL}>Nova senha</label>
            <div className="relative">
              <Input id="new-password" type={showPw ? 'text' : 'password'} autoComplete="new-password"
                minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required
                className={`${FIELD} pr-12`} />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A9968C]">
                {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="text-[11.5px] text-[#7E6E66]">Pelo menos 8 caracteres.</p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="confirm-password" className={LABEL}>Repita a nova senha</label>
            <Input id="confirm-password" type={showPw ? 'text' : 'password'} autoComplete="new-password"
              minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={FIELD} />
          </div>

          <Button type="submit" disabled={loading} className="h-[54px] rounded-[14px] text-[16px] font-bold">
            {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Salvando…</> : 'Salvar nova senha'}
          </Button>

          <button type="button" onClick={cancel} className="text-[13.5px] text-[#7E6E66] hover:underline">
            Cancelar
          </button>
        </form>
      </div>
    </div>
  );
}
