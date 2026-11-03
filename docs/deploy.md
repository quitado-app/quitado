# Deploying Quitado

## With Docker

```bash
cp .env.example .env      # set QUITADO_RECIPIENT and QUITADO_ACCESS_SECRET, then the rest
docker compose up -d
```

The container runs as a non-root user, with a read-only filesystem and all capabilities dropped. The
database lives in the `quitado-data` volume, so it survives upgrades. It listens on `127.0.0.1:3000`
only: to serve it to the internet, put a reverse proxy with TLS in front of it.

On a public mainnet instance set:

- `QUITADO_BASE_URL=https://your.domain` (the app refuses plain http on mainnet, except for localhost)
- `QUITADO_TRUST_PROXY=true`, so the real client address is used for rate limits
- `QUITADO_RPC_URL=...`, a dedicated RPC provider (the public RPC is rate limited)

At startup the app prints a warning for each of these it thinks you forgot.

## Upgrading and backups

Upgrade with `git pull && docker compose up -d --build`. The data volume is kept.

Back up the volume. The invoices (client names, descriptions) exist only in the database; payments can
be found again on chain, invoices cannot. Take a snapshot of the volume, or copy the database file
while the app is stopped.

## Before the first real payment (mainnet checklist)

1. **Double-check `QUITADO_RECIPIENT`.** A wrong address sends real money to someone else. Send a
   tiny amount first.
2. **The receiving wallet should already hold a token account for USDC and for USDT.** Receive a
   small amount of each first. Some wallets cannot pay an address that has no token account yet.
3. Use a long random `QUITADO_ACCESS_SECRET` and keep it out of git (`.env` is ignored).
4. Create a small invoice (for example 1 USDC) and pay it from a **different** wallet, scanning the
   QR code with a real phone wallet. Note which wallets worked.
5. Expect the page to switch to "paid" about 15 to 40 seconds after the payment, because invoices are
   settled at `finalized` commitment.
6. Open the receipt and follow its explorer link.
7. Check `docker compose logs`: every settled payment is logged as one JSON line.
