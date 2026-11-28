# Quitado

Open-source, non-custodial USDC/USDT invoicing on Solana for Brazilian freelancers.

> **Status: early development, not ready for production use.** The core, storage, payment detection
> and the web app work and are tested (including against a real devnet). The owner can download
> the paid invoices as a CSV file for an accountant (amounts in the token, no tax calculation). The
> Brazilian tax layer (exchange-rate references, tax rules) is planned and not built yet.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/quitado)

You can run your own instance on Railway with one click, or on any server with Docker (see below).

## At a glance

- **What it is:** a way for a freelancer paid from abroad to bill in USDC or USDT on Solana. You send
  a link, the client pays from their wallet, the invoice marks itself as paid and a PDF receipt is
  issued. Quitado never holds the money or the keys and charges no fee. It runs on Solana mainnet.
- **New in the Dev3pack hackathon (27 to 29 November 2026):** a CSV export of paid invoices for the
  accountant, a public page that re-checks a payment on the Solana blockchain, and a link-preview
  image for the site. The full list, with its pull requests, is in
  [During the hackathon](#during-the-hackathon-27-to-29-november); the state before it is the git
  tag [`pre-hackathon`](https://github.com/quitado-app/quitado/tree/pre-hackathon).
- **See it working:** the home page is [quitado.finance](https://quitado.finance). The author's own
  instance runs at `pay.quitado.finance`: its owner area needs the owner's secret, but payment pages
  and the `/verify` page are public. To run your own in a few minutes, use the Railway button above
  and the [step-by-step guide in Portuguese](docs/pt-BR/railway.md).
- **Honest status:** early stage. There are no customers yet, and the Brazilian tax layer is planned,
  not built.

## What it is

You create an invoice, send your client a link, and the client pays from any Solana wallet by
scanning a QR code. The money goes straight to your own wallet: Quitado never holds funds or private
keys, takes no fee, and needs no account, only a wallet address. The app notices the payment on
chain and marks the invoice as paid.

You run your own instance (one owner per instance). There is no hosted service.

## Hackathon: what was done before and what is new

This project was started on 1 November 2026, before the Dev3pack Global Hackathon (27 to 29
November 2026). The state at the start of the hackathon is the git tag
[`pre-hackathon`](https://github.com/quitado-app/quitado/tree/pre-hackathon) (26 November
2026, 81 commits, 40 merged pull requests, 358 tests).

### Before the hackathon (1 to 26 November)

- **Core:** the invoice domain in integer base units (no rounding errors), USDC and USDT.
- **Storage:** SQLite through Node's built-in `node:sqlite`, with migrations and atomic settlement.
- **Payment detection:** a Solana Pay reference plus the change in the recipient's token balance,
  checked at `finalized`; tested against a real devnet.
- **Web app:** owner panel, public payment page with QR code and "open in wallet", payment
  receipt as a PDF (own writer, no extra dependency), usage statistics, Portuguese and English,
  accessibility work.
- **Running it:** Docker, a Railway template with a one-click button, and step-by-step guides in
  Portuguese, including one for people new to Solana.
- **Live:** an instance on Solana mainnet at https://pay.quitado.finance and the home page at
  https://quitado.finance. The author made real test payments in USDC and USDT on mainnet.
- **Quality:** an independent security review (findings fixed), CI with secret scanning, and the
  guides revised after questions from the first beta testers.

### During the hackathon (27 to 29 November)

The hackathon work started at the git tag `hackathon-start` (27 November 2026, 12:00 Brasília time).
Everything committed after it is the work done during the hackathon:
[compare `hackathon-start...main`](https://github.com/quitado-app/quitado/compare/hackathon-start...main).
This list is updated as each piece ships, newest last.

- **27 Nov: CSV export of paid invoices for the accountant**
  ([#46](https://github.com/quitado-app/quitado/pull/46)). An owner-only `/admin/export/paid.csv`,
  with an optional year and month, linked from the stats page. It opens in Excel with accents and
  columns in place (UTF-8 with a byte order mark; `;` and a decimal comma in Portuguese), amounts are
  exact decimals built from integer base units, and cells are protected against spreadsheet formula
  injection. No tax calculation, no conversion to reais, no outside calls, no new dependency.
- **27 Nov: a spreadsheet tip next to the CSV button**
  ([#47](https://github.com/quitado-app/quitado/pull/47)). Excel shows `#####` when a date column is
  too narrow, which looks like an error; the stats page and the docs now say the file is fine and how
  to widen the column. Found by trying the export in Excel.
- **27 Nov: a link-preview image for the home page**
  ([#49](https://github.com/quitado-app/quitado/pull/49)). Sharing the site on X, LinkedIn or WhatsApp
  showed a grey card with no image. There is now a 1200x630 PNG per language (Portuguese and English),
  drawn with the site's own mark, served by the app itself, and the page has the `og:image` and
  `twitter:card` tags. A test checks the tags and that the files are real 1200x630 PNGs.
- **27 Nov: a public page to check a payment on the blockchain**
  ([#50](https://github.com/quitado-app/quitado/pull/50)). On `/verify`, anyone can paste a transaction
  signature and the page re-reads that transaction from the Solana network (at `finalized`), with the
  same rules the payment detection uses, and shows the amount, token, recipient, payer and block time
  that the chain itself reports. It is linked from the paid payment page, shows no client data, and
  answers "not confirmed" when the chain does not show the recorded payment. Only signatures this
  instance recorded reach the network, with their own rate limit, so it cannot be used to spend the
  owner's RPC credits. Checked on the live instance against the author's two real mainnet test
  payments (0.10 USDC and 0.10 USDT).
- **27 Nov: a devnet section in the Portuguese Railway guide**
  ([#53](https://github.com/quitado-app/quitado/pull/53)). A beta tester asked whether he could try
  Quitado without real money, so the guide now explains how to use the Solana devnet, with test USDC
  from Circle's faucet and the devnet USDC address that Circle lists in its own documentation. It says
  plainly that this path is less tested than mainnet.

### What does not exist

There are no users yet beyond the author: the first beta testers are only now starting. There is
no hosted service and no tax layer. The receipt is not a nota fiscal.

## Documentation

- [Web app: running it, access and security](docs/web.md)
- [Guia rápido em português](docs/pt-BR/guia-rapido.md)
- [Quitado na Railway, passo a passo (português)](docs/pt-BR/railway.md)
- [Deploying with Docker, and the mainnet checklist](docs/deploy.md)
- [A Railway template for Quitado](docs/railway-template.md)
- [Payment detection](docs/payment-detection.md)
- [Payment receipts (PDF)](docs/receipts.md)
- [Devnet spike: what we verified about Solana Pay](docs/spike-devnet.md)
- [Security policy](SECURITY.md)

## License

[Apache-2.0](LICENSE)
