# Templates de e-mail (Supabase Auth)

HTML dos e-mails transacionais do CaRe Wallet, com a cara do app (mascote,
cores, tom de voz). O Supabase não lê estes arquivos sozinho — é preciso
colar o conteúdo no dashboard.

## Como aplicar

1. **Supabase Dashboard** → seu projeto → **Authentication** → **Email Templates**.
2. Abra o template correspondente:
   - `confirm-signup.html` → template **"Confirm signup"**
   - `reset-password.html` → template **"Reset Password"**
3. No campo **Subject**, sugestão:
   - Confirm signup: `Confirme seu e-mail — CaRe Wallet`
   - Reset Password: `Redefinir sua senha — CaRe Wallet`
4. No campo **Message body**, apague o conteúdo atual e cole o HTML do
   arquivo correspondente (o editor do Supabase aceita HTML puro).
5. **Save**.

Repita pros outros templates (Magic Link, Invite, Change Email) se quiser —
ainda não foram feitos porque só confirmação e recuperação de senha estão
em uso hoje no app.

## Variáveis usadas

Ambos usam só o que o Supabase já injeta automaticamente:

| Variável | Onde aparece |
|---|---|
| `{{ .ConfirmationURL }}` | link do botão e o link alternativo em texto |
| `{{ .Email }}` | e-mail do destinatário, citado no corpo |
| `{{ .Data.full_name }}` | (só na confirmação) nome do cadastro, se foi preenchido |

Não precisa mexer em nada no código do app nem no SMTP (Resend) — é
só o corpo do e-mail que muda.

## Testando

Depois de salvar, dispare os dois fluxos de verdade pra ver o resultado:

- **Confirmação**: cadastre uma conta nova (ou "Reenviar e-mail" na tela de
  "Confirme seu e-mail" do app).
- **Recuperação**: "Esqueci minha senha" na tela de login.

O logo é carregado de `https://carewallet.cafemagia.dev.br/pwa-512.png` —
se o domínio ou o arquivo mudar de nome um dia, atualiza a URL nos dois
arquivos aqui.
