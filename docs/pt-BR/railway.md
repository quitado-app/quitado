# Quitado na Railway: passo a passo para quem vai testar

Este guia leva você de zero até uma instância sua do Quitado no ar, sem precisar mexer em servidor. A
Railway é um serviço que roda programas na nuvem: você aponta para o código, define alguns valores e
ela cuida do resto.

> **Atenção:** o Quitado está em estágio inicial e ainda não é recomendado para uso em produção.
> Comece com valores pequenos, como 1 USDC. A Railway tem seus próprios planos e preços: veja no site
> deles antes de começar.

O dinheiro vai **direto para a sua carteira**. O Quitado nunca guarda seus fundos nem suas chaves, e
cada instância tem um único dono: você.

## O que você precisa antes (uns 10 minutos)

1. **Uma carteira Solana sua** (Phantom, Solflare, Backpack ou outra). Copie o **endereço público**
   dela. Nunca informe a frase de recuperação nem a chave privada a ninguém, nem aqui.
   Receba antes um valor bem pequeno de **USDC** e de **USDT** nessa carteira: algumas carteiras não
   conseguem pagar um endereço que nunca recebeu aquele token.
2. **Uma conta na Railway**, entrando com o seu GitHub: <https://railway.com>
3. **Uma URL de RPC da Solana.** O RPC é o serviço que dá ao seu Quitado acesso à rede para ver se o
   pagamento chegou. O público e gratuito é limitado demais para uso real. Crie uma conta gratuita em
   um provedor de RPC (por exemplo, a Helius), crie uma chave e copie a **URL da mainnet**. Essa URL
   contém a sua chave: trate como senha e não compartilhe.
4. **Uma cópia (fork) do Quitado na sua conta do GitHub.** Abra
   <https://github.com/quitado-app/quitado> e clique em **Fork**. A Railway vai publicar a partir da
   sua cópia.

## Passo 1: criar o projeto

1. Na Railway, clique em **New Project** e escolha **Deploy from GitHub repo**.
2. Escolha o seu fork `quitado`.
3. A Railway começa a construir na hora. **O primeiro deploy pode falhar, e isso é esperado:** ainda
   faltam as configurações abaixo, e o Quitado se recusa a iniciar sem elas (o motivo aparece nos
   logs do deploy).

## Passo 2: valores (aba Variables)

Abra o serviço, vá em **Variables** e crie estas:

| Variável                     | O que colocar                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `QUITADO_RECIPIENT`          | O endereço público da **sua** carteira, que vai receber os pagamentos              |
| `QUITADO_ACCESS_SECRET`      | Uma senha longa e aleatória (mínimo 20 caracteres), que você digita para entrar    |
| `QUITADO_RPC_URL`            | A URL de RPC da mainnet que você copiou                                            |
| `QUITADO_UTC_OFFSET_MINUTES` | `-180`, para que o vencimento termine às 23:59 no horário de Brasília              |
| `RAILWAY_RUN_UID`            | `0` (a Railway monta o volume como root, e sem isso o Quitado não consegue gravar) |
| `QUITADO_OWNER_NAME`         | (opcional) Seu nome ou o nome do seu negócio, que aparece como "De" nas faturas    |

Para a senha, use o gerador do seu gerenciador de senhas ou rode no terminal:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

**Guarde a senha de acesso e a URL de RPC só na Railway e no seu gerenciador de senhas.** Não as
envie para ninguém e não as coloque no GitHub.

O endereço público e o proxy da Railway são configurados sozinhos quando você usa o domínio que ela
gera (passo 4): você não precisa criar `QUITADO_BASE_URL` nem `QUITADO_TRUST_PROXY`.

## Passo 3: o volume (onde ficam as faturas)

As faturas só existem no banco de dados do Quitado. Sem um volume, elas se perdem a cada atualização.

1. No painel do projeto, clique com o botão direito no serviço e escolha **Attach Volume**.
2. Em **Mount path**, digite `/data`.

## Passo 4: endereço público e verificação de saúde

1. No serviço, vá em **Settings**, depois **Networking**, e clique em **Generate Domain**. Anote o
   endereço, algo como `quitado-production-xxxx.up.railway.app`.
2. Ainda em **Settings**, na parte de **Deploy**, defina o **Healthcheck Path** como `/healthz`. Com
   isso, uma versão com problema nunca substitui a que está funcionando.

## Passo 5: publicar de novo

Clique em **Deploy** (ou em **Redeploy** no último deploy). Quando o status ficar verde (**Active**), o
Quitado está no ar.

> Se você gerou o domínio **depois** do primeiro deploy, faça este novo deploy: é ele que faz o
> Quitado conhecer o próprio endereço, e os links de pagamento dependem disso.

## Passo 6: entrar e fazer o primeiro teste

1. Abra `https://SEU-ENDERECO.up.railway.app/admin` (o endereço do passo 4) e entre com a senha de
   acesso. O painel abre em português se o seu navegador estiver em português.
2. Clique em **Nova fatura**: cliente, descrição, token (USDC ou USDT), valor e vencimento.
   **Use 1 USDC no primeiro teste.**
3. Copie o **link de pagamento** e abra no celular.
4. Pague **de outra carteira**, tocando em **Abrir na carteira** ou escaneando o QR code.
5. Espere de 15 a 40 segundos: a página se atualiza sozinha para **Paga**, e o recibo em PDF fica
   disponível.

Se isso funcionou, a instância está pronta. Confira três vezes o endereço em `QUITADO_RECIPIENT`
antes de mandar o link para um cliente de verdade: um endereço errado manda dinheiro real para outra
pessoa.

## Quando algo não funciona

| O que acontece                                      | O que provavelmente é                                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| O deploy falha e o log fala de variável obrigatória | Faltou `QUITADO_RECIPIENT` ou `QUITADO_ACCESS_SECRET` (a senha precisa ter 20 caracteres ou mais)                    |
| O log fala de permissão ao gravar o banco           | Faltou `RAILWAY_RUN_UID=0` ou o volume em `/data`                                                                    |
| O link de pagamento começa com `localhost`          | O domínio foi gerado depois do primeiro deploy: faça um novo deploy                                                  |
| A fatura nunca vira paga                            | A URL de RPC está errada ou vencida, ou o cliente digitou o endereço à mão em vez de usar o botão ou o QR code       |
| A carteira do cliente diz "endereço inválido"       | Abra a página de pagamento no celular e use **Abrir na carteira**, em vez de escanear pela tela de envio da carteira |
| A página abre, mas o painel pede senha de novo      | A senha de acesso foi trocada: ela desconecta todo mundo                                                             |

## Cuidados depois que estiver no ar

- **Backup.** Na aba **Backups** do serviço, ative as cópias automáticas. O comando
  e os detalhes estão em [Publicação, Railway e checklist da mainnet](../deploy.md). Guarde também uma
  cópia fora da Railway de vez em quando.
- **Endereço próprio.** Se quiser um endereço seu (por exemplo `pagar.seudominio.com`), adicione-o em
  **Settings**, **Networking**, **Custom Domain**, crie os registros que a Railway mostrar no seu
  provedor de domínio e defina `QUITADO_BASE_URL` com o endereço novo, começando por `https://`.
- **Atualizar.** No GitHub, sincronize o seu fork (**Sync fork**). A Railway publica a nova versão
  sozinha.
- **Imposto e conversão.** O Quitado não converte para reais nem emite nota fiscal. Converse com o seu
  contador sobre como declarar o que você recebe.
- **Encontrou algo estranho?** Veja [SECURITY.md](../../SECURITY.md) para falhas de segurança, e não
  abra um issue público.

## Para quem mantém o projeto

Existe uma especificação para criar um template da Railway com tudo isso já preenchido, para virar um
botão "Deploy on Railway": [railway-template.md](../railway-template.md).
