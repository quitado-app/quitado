# Quitado

Open-source, non-custodial USDC/USDT invoicing on Solana for Brazilian freelancers.

> **Status: early development, not ready for production use.** The core, storage, payment detection
> and the web app work and are tested (including against a real devnet). The owner can download
> the paid invoices as a CSV file for an accountant (amounts in the token, no tax calculation). The
> Brazilian tax layer (exchange-rate references, tax rules) is planned and not built yet.

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/quitado)

You can run your own instance on Railway with one click, or on any server with Docker (see below).

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

Everything committed after the `pre-hackathon` tag is the work done during the hackathon:
[compare `pre-hackathon...main`](https://github.com/quitado-app/quitado/compare/pre-hackathon...main).
A summary of it is written here when the hackathon work is finished.

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
