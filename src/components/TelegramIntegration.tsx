// Card de conectar o bot do Telegram — usado em Ajustes › Integrações e no
// passo de bot do onboarding guiado. Em arquivo próprio (não em Settings.tsx)
// pra não puxar a página inteira de Ajustes pro bundle de quem só precisa
// deste cartão (o onboarding carrega no primeiro login, antes de qualquer
// lazy-load de página).
import { useState, useEffect, useRef, useCallback } from 'react';
import { useFinance } from '@/contexts/FinanceContext';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { newId } from '@/lib/utils';
import { Copy, Send, CheckCircle2 } from 'lucide-react';

interface ChatLinkRow { id: string; external_id: string }

export function TelegramIntegration() {
  const { userId, walletId, wallet } = useFinance();
  const { toast } = useToast();
  const botUser = import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined;

  const [link, setLink] = useState<ChatLinkRow | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !walletId) return;
    const { data } = await supabase
      .from('chat_links')
      .select('id, external_id')
      .eq('provider', 'telegram').eq('user_id', userId).eq('wallet_id', walletId)
      .maybeSingle();
    setLink((data as ChatLinkRow) ?? null);
    setLoading(false);
  }, [userId, walletId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Enquanto houver token pendente, verifica a cada 3s se o vínculo foi criado.
  useEffect(() => {
    if (!token) return;
    pollRef.current = setInterval(() => { void refresh(); }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [token, refresh]);

  useEffect(() => { if (link && token) setToken(null); }, [link, token]);

  const generate = async () => {
    if (!userId || !walletId) return;
    setBusy(true);
    try {
      // 32 chars hex — bem abaixo do limite de 64 do parâmetro start do Telegram
      const t = newId().replace(/-/g, '');
      const { error } = await supabase.from('chat_link_tokens').insert({
        token: t, provider: 'telegram', user_id: userId, wallet_id: walletId,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      setToken(t);
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!link) return;
    setBusy(true);
    try {
      await supabase.from('chat_links').delete().eq('id', link.id);
      setLink(null);
      toast({ title: 'Telegram desconectado' });
    } catch (err) {
      toast({ title: 'Erro', description: (err as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const deepLink = botUser && token ? `https://t.me/${botUser}?start=${token}` : null;

  return (
    <Card className="max-w-xl">
      <CardHeader className="p-[22px] pb-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#E7F2F1] text-accent">
            <Send className="h-5 w-5" />
          </span>
          <div>
            <CardTitle className="font-display text-[15.5px] font-bold">Telegram</CardTitle>
            <p className="text-[12px] text-muted-foreground">Lance gastos por mensagem, sem abrir o app</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-[22px] pt-0 text-sm">
        <p className="text-[12.5px] text-muted-foreground">
          Conecte um chat do Telegram a <strong>{wallet?.name}</strong> para lançar gastos por mensagem
          (“mercado 87,50 nubank”) e receber os lembretes das contas do dia.
        </p>

        {!botUser && (
          <div className="rounded-[12px] border border-[#F2C98A] bg-[#F3EBE5] p-3 text-[12px] text-[#5C4C45]">
            Falta definir <code>VITE_TELEGRAM_BOT_USERNAME</code> no ambiente do app (o nome do bot, sem @).
          </div>
        )}

        {loading ? (
          <div className="h-10 animate-pulse rounded-[12px] bg-muted" />
        ) : link ? (
          <div className="flex items-start justify-between gap-3 rounded-[12px] border border-[#DCEDE7] bg-[#F4F9F7] px-[14px] py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <CheckCircle2 className="mt-px h-[19px] w-[19px] shrink-0 text-[#1F6B67]" />
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-[#1F6B67]">
                  {botUser ? `Conectado a @${botUser}` : 'Conectado'}
                </div>
                <div className="truncate text-[11.5px] text-[#3E8B85]">Vinculado à carteira {wallet?.name}</div>
              </div>
            </div>
            <button type="button" disabled={busy} onClick={disconnect}
              className="shrink-0 text-[12.5px] font-semibold text-[#7E6E66] hover:text-foreground">
              Desconectar
            </button>
          </div>
        ) : deepLink ? (
          <div className="space-y-2">
            <p className="text-[11.5px] font-bold uppercase tracking-wide text-[#7E6E66]">Conectar outro chat</p>
            <div className="flex gap-2">
              <Input readOnly value={deepLink}
                className="h-[38px] rounded-[10px] border-[#EAE1DA] bg-[#FDFAF8] font-mono text-[12.5px] text-[#5C4C45]"
                onFocus={(e) => e.currentTarget.select()} />
              <Button size="sm" className="h-[38px] shrink-0 bg-accent text-white hover:bg-accent/90"
                onClick={() => { void navigator.clipboard?.writeText(deepLink); toast({ title: 'Link copiado' }); }}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <p className="text-[11.5px] text-[#7E6E66]">
              Abra no celular com o Telegram instalado e toque em <strong>Iniciar</strong>. Expira em 10 min.
            </p>
            <p className="text-[11px] text-muted-foreground">Aguardando a confirmação do bot…</p>
          </div>
        ) : (
          <Button className="h-[38px]" disabled={busy || !botUser} onClick={generate}>
            <Send className="mr-2 h-4 w-4" /> Gerar link de conexão
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
