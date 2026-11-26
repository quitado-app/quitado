# Quitado na Railway: passo a passo para quem vai testar

Este guia leva você de zero até uma instância sua do Quitado no ar, sem precisar mexer em servidor. A
Railway é um serviço que roda programas na nuvem: você aponta para o código, define alguns valores e
ela cuida do resto.

**Como as peças se encaixam:** o Quitado é um **aplicativo web de cobrança**. É ele que você sobe na
Railway, e é ele que cria os links de pagamento e as páginas que o seu cliente vê. A **Helius**, mais
abaixo, não é um servidor que você roda: é um serviço de **RPC**, a "janela" que o Quitado usa para
olhar a blockchain da Solana e ver se o pagamento chegou. Você só cria uma conta lá e copia uma chave.

> **Atenção:** o Quitado está em estágio inicial e ainda não é recomendado para uso em produção.
> Comece com valores pequenos, como 1 USDC. A Railway tem seus próprios planos e preços: veja no site
> deles antes de começar.

Prefere rodar na sua própria máquina ou servidor, com Docker? Veja o [guia rápido](guia-rapido.md).

O dinheiro vai **direto para a sua carteira**. O Quitado nunca guarda seus fundos nem suas chaves, e
cada instância tem um único dono: você.

## Primeira vez com Solana? Comece por aqui

Se você já tem uma carteira Solana, USDC e uma conta em um provedor de RPC, pule para **O caminho mais
curto: o botão**. Se não, estas são as quatro coisas que você precisa arrumar antes (a ordem importa).

### 1. Uma carteira Solana

1. Instale a **Phantom** (<https://phantom.com>) ou a **Solflare** (<https://solflare.com>), pela
   loja oficial do celular ou do navegador. Cuidado com aplicativos falsos: confira o nome do
   desenvolvedor e confirme o endereço do site.
2. Ao criar a carteira, ela mostra uma **frase de recuperação** (12 ou 24 palavras). Anote **no papel**
   e guarde em lugar seguro. Quem tem essa frase tem o seu dinheiro. **Ninguém pode te pedir isso**:
   nem o Quitado, nem a Railway, nem quem te ajuda a testar.
3. Abra a carteira e copie o seu **endereço público** (uma sequência de letras e números). É ele que vai
   em `QUITADO_RECIPIENT`. Esse endereço pode ser compartilhado sem problema.

### 2. Um pouco de USDC (e de SOL para a taxa)

Para o teste você precisa de **cerca de US$ 1 a 2 em USDC** e de **uma segunda carteira** para pagar a
fatura de teste (a maioria dos aplicativos deixa criar mais de uma conta, ou use a carteira de um
amigo). A carteira que **paga** também precisa de um pouquinho de **SOL** (menos de US$ 1) para a taxa
de rede da Solana.

1. Em uma **corretora autorizada** (muitas aceitam Pix), compre o USDC e o SOL.
2. **Saque para o endereço da sua carteira escolhendo a rede Solana.** Esse é o erro que mais custa
   caro: se você escolher outra rede (Ethereum, Tron e outras), o dinheiro pode ser perdido. Faça
   primeiro um saque bem pequeno para conferir.
3. Confira na carteira que o USDC chegou.

O Quitado não compra nem converte dinheiro: isso é feito por fora, na corretora.

### 3. Uma conta em um provedor de RPC

O RPC é o serviço que dá ao seu Quitado acesso à rede Solana para ver se o pagamento chegou. O
público e gratuito é limitado demais, então crie uma conta em um provedor. Estas são as telas da
**Helius**, vistas em novembro de 2026 (podem mudar):

1. Crie a conta em <https://dashboard.helius.dev/signup>. Existe um plano gratuito (a Helius informa
   1 milhão de créditos por mês e 10 requisições por segundo), que deve bastar para o teste. Se a
   Helius pedir um **endereço de rebate** (rebate address) ou algo parecido, ele é **opcional** e
   pode ficar em branco: não faz diferença para o Quitado. Se quiser preencher, use só o seu
   endereço **público**, e nunca a frase de recuperação.
2. No painel, abra **API Keys** e clique em **Create New API Key**. Dê um nome e **copie a chave na
   hora**: depois ela não aparece de novo.
3. A URL da mainnet tem este formato, com a sua chave no lugar de `SUA_CHAVE`:
   `https://mainnet.helius-rpc.com/?api-key=SUA_CHAVE`. Essa é a `QUITADO_RPC_URL`.
4. **Essa URL contém a sua chave: trate como senha.** Não mande para ninguém, nem coloque no GitHub.

### 4. Uma conta na Railway, e quanto ela custa

Entre em <https://railway.com> com o seu GitHub. Valores vistos em novembro de 2026; **confira em
<https://railway.com/pricing>** antes de começar:

- Conta nova ganha um **teste de 30 dias com US$ 5 em créditos, sem cartão**. Acabando os créditos ou os
  30 dias, os serviços param e você escolhe um plano (o Hobby custa US$ 5 por mês e inclui US$ 5 de uso).
- A Railway pode colocar contas novas em um **teste limitado**, com acesso restrito à rede, dependendo
  da idade e da atividade da sua conta no GitHub. A verificação fica em <https://railway.com/verify>.
  Ainda não sabemos se esse limite atrapalha o Quitado. Se a sua fatura **nunca** virar paga mesmo
  pagando certo, confira essa verificação e **conte para a gente**: é exatamente o tipo de coisa que
  queremos descobrir.

### O teste, do começo ao fim

1. Clique no botão da Railway e faça o deploy (veja **O caminho mais curto: o botão**, logo abaixo).
2. Quando o deploy ficar verde (**Active**), abra o endereço público da sua instância e acrescente
   `/admin` no final, por exemplo `https://SEU-ENDERECO.up.railway.app/admin`. Entre com a senha de
   acesso. É essa a tela de administração do Quitado, onde você cria as faturas.
3. **No painel**, clique em **Nova fatura**, preencha cliente, descrição, token **USDC**, valor **1** e
   vencimento, e clique em **Criar fatura**. Os detalhes estão no
   [Passo 6](#passo-6-entrar-e-fazer-o-primeiro-teste).
4. Copie o **link de pagamento** que aparece, abra no celular e pague **da segunda carteira**, com
   **Abrir na carteira** ou o QR code.
5. Espere até uns 40 segundos: a fatura deve aparecer como **Paga**.
6. Baixe o **recibo em PDF**.

Anote onde você travou e quanto tempo cada passo levou: é isso que nos ajuda a melhorar este guia.

## O caminho mais curto: o botão

1. Clique em **Deploy on Railway**: <https://railway.com/deploy/quitado>. Entre na Railway com o seu GitHub.
2. Preencha as duas coisas que a Railway pede e clique em **Deploy**:
   - `QUITADO_RECIPIENT`: o endereço público da **sua** carteira Solana.
   - `QUITADO_RPC_URL`: a URL de RPC da mainnet (veja o item 3 logo abaixo).
     `QUITADO_OWNER_NAME` é opcional: seu nome ou o do seu negócio, que aparece como "De" nas faturas.
3. Quando o deploy ficar verde (**Active**), clique no serviço e copie o endereço público: ele aparece
   no topo do serviço ou em **Settings**, **Networking**, e termina em `.up.railway.app`. A senha de
   acesso foi gerada sozinha: ela está em **Variables**, em `QUITADO_ACCESS_SECRET`.
4. Abra `https://SEU-ENDERECO.up.railway.app/admin`, entre com essa senha e faça o primeiro teste com
   1 USDC (passo 6 mais abaixo).

Com o botão, o volume `/data`, a verificação de saúde e o endereço público já vêm configurados. Tenha
em mãos a carteira e a URL de RPC (o item "O que você precisa antes"). Se preferir fazer à mão, ou se algo
sair diferente, siga o passo a passo completo abaixo.

## O que você precisa antes (uns 10 minutos)

1. **Uma carteira Solana sua** (Phantom, Solflare, Backpack ou outra). Copie o **endereço público**
   dela. Nunca informe a frase de recuperação nem a chave privada a ninguém, nem aqui.
   Receba antes um valor bem pequeno de **USDC** e de **USDT** nessa carteira: algumas carteiras não
   conseguem pagar um endereço que nunca recebeu aquele token. Se você ainda não tem esses tokens,
   compre ou receba em uma corretora e envie para o endereço da sua carteira (na rede **Solana**).
   Você também vai precisar de uma **segunda carteira** com um pouco de USDC para fazer o teste do
   passo 6 (pode ser a de um amigo).
2. **Uma conta na Railway**, entrando com o seu GitHub: <https://railway.com>
3. **Uma URL de RPC da Solana.** O RPC é o serviço que dá ao seu Quitado acesso à rede para ver se o
   pagamento chegou. O público e gratuito é limitado demais para uso real. Crie uma conta gratuita em
   um provedor de RPC (por exemplo, a Helius), crie uma chave e copie a **URL da mainnet**. Essa URL
   contém a sua chave: trate como senha e não compartilhe.
4. **Uma cópia (fork) do Quitado na sua conta do GitHub.** **Só para o passo a passo completo; com o
   botão você não precisa disso.** Abra <https://github.com/quitado-app/quitado> e clique em **Fork**.
   A Railway vai publicar a partir da sua cópia.

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
4. Pague **de outra carteira**, tocando em **Abrir na carteira** ou escaneando o QR code, a partir do
   saldo comum da carteira (não de um saldo privado). **Não vale** sacar de uma corretora para o endereço
   digitado à mão: só o botão e o QR code marcam a fatura como paga.
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
- **Atualizar.** Se você usou o passo a passo com fork, sincronize o fork no GitHub (**Sync fork**) e a
  Railway publica a nova versão sozinha. Se você usou o botão, veja em **Settings**, **Source**, de onde o
  serviço recebe as atualizações.
- **Saldo privado.** Não ative o saldo privado de uma carteira (como o Modo Privado da Solflare) no
  endereço que recebe as faturas: o Quitado só enxerga o saldo público, e um pagamento privado deixaria
  a fatura aberta mesmo paga.
- **Imposto e conversão.** O Quitado não converte para reais nem emite nota fiscal. Converse com o seu
  contador sobre como declarar o que você recebe.
- **Encontrou algo estranho?** Veja [SECURITY.md](../../SECURITY.md) para falhas de segurança, e não
  abra um issue público.

## Travou em algum ponto?

Estamos procurando exatamente isso: onde as pessoas travam. Se algo não estava claro ou não funcionou,
abra um [issue no GitHub](https://github.com/quitado-app/quitado/issues) (sem colocar senha, URL de
RPC nem dados de clientes) ou conte para quem te indicou o Quitado. Falha de segurança: veja o item
acima, e não use o issue público.

## Para quem mantém o projeto

O template do botão está descrito em [railway-template.md](../railway-template.md).
