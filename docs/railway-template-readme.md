# Deploy and Host Quitado on Railway

Quitado is open-source, non-custodial invoicing in USDC and USDT on Solana, for people who work for
themselves. You create an invoice and send your client a link. The client pays from their own Solana
wallet, and the invoice marks itself paid as soon as the payment is confirmed on-chain. The money goes
straight to your wallet: Quitado never holds funds or keys, and it charges no fee.

> **Early-stage software.** It works on Solana mainnet, but it is not yet recommended for production
> use. Start with small amounts.

## About Hosting

This template deploys your own Quitado instance: one container built from the project's Dockerfile, with
its SQLite database on a volume mounted at `/data`. One instance has one owner and one wallet. There is no
shared service and no account: you run it, and you sign in with an access secret that is generated for you
(read it in the service's **Variables** tab after the deploy).

What you fill in when you deploy:

| Variable             | What to put                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `QUITADO_RECIPIENT`  | The **public address** of your Solana wallet. Never your recovery phrase or private key.                           |
| `QUITADO_RPC_URL`    | A Solana mainnet RPC URL from a provider (the free public one is too limited). It contains a key: keep it private. |
| `QUITADO_OWNER_NAME` | Optional. Your name or business name, shown as "From" on invoices.                                                 |

`QUITADO_UTC_OFFSET_MINUTES` is set to `-180` (Brasília time); change it if you are elsewhere.

## Why Deploy

- **Your money stays yours.** Payments go directly to your wallet address. Quitado has no balance, no
  withdrawal step and no fee of its own (Solana charges the payer a small network fee).
- **Checkable.** Every paid invoice points to a transaction anyone can verify on a Solana explorer, and the
  payer can download a PDF receipt that links to it.
- **English and Brazilian Portuguese.** Pages follow the visitor's browser language.
- **No third-party scripts, fonts or trackers.** The code is Apache-2.0 and open for you to read.

## Common Use Cases

- A freelancer billing a client abroad in USDC or USDT and getting paid into their own wallet.
- Trying Quitado before running it somewhere else: deploy, create a 1 USDC invoice, and pay it from another
  wallet.

After the deploy: open the service's public domain followed by `/admin`, sign in with the access secret,
create a small invoice and pay it from **another** wallet (with the wallet's **Open in wallet** button or the
QR code). The page turns to Paid by itself in about 15 to 40 seconds. Then turn on volume backups (service
**Backups** tab): the invoices exist only in the database.

Good to know: your wallet should already hold a token account for USDC and for USDT (receive a tiny amount of
each first); a payment smaller than the invoice does not settle it; the issuers of USDC and USDT can freeze
tokens; the receipt is proof of an on-chain payment, not a nota fiscal (Brazilian tax document).

## Dependencies for Quitado Hosting

### Deployment Dependencies

- A Solana wallet of your own (only its public address is needed).
- A Solana mainnet RPC provider and its URL.
- Source code and docs (Apache-2.0): <https://github.com/quitado-app/quitado>
- Step-by-step guide in Portuguese: <https://github.com/quitado-app/quitado/blob/main/docs/pt-BR/railway.md>
- Security policy: <https://github.com/quitado-app/quitado/blob/main/SECURITY.md>

## Em português

O Quitado é um sistema de cobrança de código aberto, sem custódia, em USDC e USDT na Solana. O cliente paga
pelo link e o dinheiro vai direto para a sua carteira. Este template sobe a sua própria instância:
preencha o endereço público da sua carteira e a URL de RPC; a senha de acesso é gerada sozinha e fica na aba
**Variables**.
