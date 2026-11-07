# Quitado: guia rápido

O Quitado é um sistema de cobrança em **USDC e USDT na Solana**, de código aberto, sem custódia e sem
taxa. Você cria uma fatura, manda o link para o cliente, e ele paga pela carteira dele. O dinheiro
vai **direto para a sua carteira**: o Quitado nunca guarda seus fundos nem suas chaves.

> **Atenção:** o projeto está em desenvolvimento e ainda não é recomendado para uso em produção.
> Comece sempre com um valor pequeno.

Cada pessoa roda a **própria instância** (uma instância, um dono). Não existe serviço hospedado: você
mesmo coloca o programa no ar.

> **Prefere não mexer em servidor?** Há um passo a passo para subir o Quitado na Railway, sem Docker
> na sua máquina: [Quitado na Railway](railway.md).

## O que você precisa

1. **Uma carteira Solana sua** (Phantom, Solflare, Backpack ou outra). O Quitado só precisa do
   **endereço público** dela. Nunca informe a frase de recuperação nem a chave privada a ninguém.
2. **Um computador ou servidor com Docker.** Para receber pagamentos de clientes, ele precisa ficar
   ligado e ter um endereço na internet com **https** (um domínio).
3. **Um provedor de RPC da Solana.** O RPC público é limitado e não serve para uso real.

## Passo a passo

### 1. Baixar o programa

```bash
git clone https://github.com/quitado-app/quitado.git
cd quitado
cp .env.example .env
```

### 2. Preencher o arquivo `.env`

Abra o `.env` e preencha, no mínimo:

| Variável                | O que colocar                                                              |
| ----------------------- | -------------------------------------------------------------------------- |
| `QUITADO_RECIPIENT`     | O endereço da **sua carteira**, que vai receber os pagamentos              |
| `QUITADO_ACCESS_SECRET` | Uma senha longa e aleatória (veja abaixo), que você digita para entrar     |
| `QUITADO_BASE_URL`      | O endereço público, com https (por exemplo `https://pagar.seudominio.com`) |
| `QUITADO_RPC_URL`       | O endereço do seu provedor de RPC                                          |
| `QUITADO_TRUST_PROXY`   | `true`, se houver um servidor intermediário com https na frente do Quitado |
| `QUITADO_OWNER_NAME`    | (opcional) Seu nome, que aparece como "From" nas faturas                   |

Para gerar uma senha forte para `QUITADO_ACCESS_SECRET`:

```bash
node -e "console.log(require('node:crypto').randomBytes(24).toString('base64url'))"
```

Para quem está no Brasil, vale também definir `QUITADO_UTC_OFFSET_MINUTES=-180`, para que o
vencimento termine às 23:59 no horário de Brasília.

**O arquivo `.env` guarda a sua senha de acesso. Nunca o envie para ninguém nem o suba para o
GitHub.**

### 3. Colocar no ar

```bash
docker compose up -d
```

O programa avisa, ao iniciar, se algo importante estiver faltando (por exemplo, o RPC).

### 4. Entrar e criar a primeira fatura

1. Abra o endereço que você configurou e vá para `/admin`.
2. Digite a senha (`QUITADO_ACCESS_SECRET`).
3. Clique em **Nova fatura**, preencha cliente, descrição, token (USDC ou USDT), valor e
   vencimento.
4. Copie o **link de pagamento** e mande para o cliente.

### 5. O que o cliente vê

O cliente abre o link e vê a página em **português ou inglês**, conforme o idioma do navegador dele
(ele pode trocar no topo da página, ou você pode mandar o link com `?lang=en` ou `?lang=pt-BR` no
final). Ele paga de duas formas: escaneando o QR code com a carteira do celular, ou tocando em
**Abrir na carteira**. A página atualiza sozinha quando o pagamento é detectado, em geral entre 15 e
40 segundos.

Depois que a fatura está paga, o cliente pode baixar um **recibo em PDF**, com a assinatura da
transação e um link para conferi-la. O recibo **não é nota fiscal**.

## Antes de receber dinheiro de verdade

1. **Confira três vezes o endereço em `QUITADO_RECIPIENT`.** Um endereço errado manda dinheiro real
   para outra pessoa. Faça primeiro um teste com um valor bem pequeno.
2. **A sua carteira precisa ter uma conta de token para USDC e para USDT.** Receba um valor pequeno de
   cada um antes, porque algumas carteiras não conseguem pagar um endereço que nunca recebeu aquele
   token.
3. Crie uma fatura de teste (por exemplo, 1 USDC) e pague de **outra carteira**, escaneando o QR code
   no celular.
4. Faça o primeiro **backup** e confirme que consegue abrir o arquivo.

## Coisas que vale saber

- **O pagamento precisa ser do valor total.** Um pagamento menor que a fatura não a quita, e dois
  pagamentos parciais não são somados.
- **Quem paga a mais** quita a fatura, e o valor realmente recebido fica registrado.
- **USDC e USDT podem ser congelados pelas empresas que os emitem.** Isso vale para os tokens, não é
  uma limitação do Quitado, e nenhum aplicativo sem custódia consegue impedir.
- **O Quitado não converte para reais nem para Pix.** Se você quiser transformar o dinheiro em reais,
  isso é feito por fora, em uma corretora autorizada.
- **Conteúdo fiscal:** o Quitado não é aconselhamento tributário. Converse com o seu contador sobre
  como declarar o que recebe.

## Backup

Os dados das faturas (clientes, descrições) só existem no banco de dados do Quitado. Faça cópias:

```bash
docker compose exec quitado node packages/server/dist/backup-cli.js
docker compose cp quitado:/data/backups ./backups
```

Guarde essas cópias **fora do servidor**.

## Estatísticas

Em **Estatísticas** (`/admin/stats`) você vê quantas faturas emitiu, pagas, abertas e vencidas, o total
recebido por token e os pagamentos por mês. Tudo é calculado no seu próprio banco. O Quitado não envia
nenhuma informação para fora.

## Onde aprender mais (em inglês)

- [Publicação, Railway e checklist da mainnet](../deploy.md)
- [Segurança e funcionamento do aplicativo web](../web.md)
- [Como os pagamentos são detectados](../payment-detection.md)
- Encontrou um problema de segurança? Veja [SECURITY.md](../../SECURITY.md) e não abra um issue
  público.
