# Quitado

Open-source, non-custodial USDC/USDT invoicing on Solana for Brazilian freelancers.

> **Status: early development, not ready for production use.** The core, storage, payment detection
> and the web app work and are tested (including against a real devnet). The Brazilian
> tax layer (exchange-rate references and accountant exports) is still being built.

## What it is

You create an invoice, send your client a link, and the client pays from any Solana wallet by
scanning a QR code. The money goes straight to your own wallet: Quitado never holds funds or private
keys, takes no fee, and needs no account, only a wallet address. The app notices the payment on
chain and marks the invoice as paid.

You run your own instance (one owner per instance). There is no hosted service.

## Documentation

- [Web app: running it, access and security](docs/web.md)
- [Deploying with Docker, and the mainnet checklist](docs/deploy.md)
- [Payment detection](docs/payment-detection.md)
- [Payment receipts (PDF)](docs/receipts.md)
- [Devnet spike: what we verified about Solana Pay](docs/spike-devnet.md)
- [Security policy](SECURITY.md)

## License

[Apache-2.0](LICENSE)
