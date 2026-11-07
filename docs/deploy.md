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

## On Railway

Railway builds the `Dockerfile` at the root of the repository. Settings checked against Railway's
documentation (November 2026):

1. **Volume:** attach one to the service and mount it at `/data`. Railway mounts volumes as `root`,
   and the image runs as a non-root user, so also set the service variable **`RAILWAY_RUN_UID=0`**.
   Without it the app cannot write its database.
2. **Port:** do not set `QUITADO_PORT`. Railway sets `PORT` and detects the port the app binds; the
   app uses `PORT` when `QUITADO_PORT` is not set.
3. **Healthcheck:** set the healthcheck path to `/healthz`. Railway only switches traffic to a new
   deployment once that returns 200, so a broken release never replaces a working one.
4. **Variables:** the same ones as above (`QUITADO_RECIPIENT`, `QUITADO_ACCESS_SECRET`,
   `QUITADO_BASE_URL`, `QUITADO_TRUST_PROXY=true`, `QUITADO_RPC_URL`, and optionally
   `QUITADO_OWNER_NAME` and `QUITADO_UTC_OFFSET_MINUTES`). With the domain Railway generates, the
   app takes its public address from `RAILWAY_PUBLIC_DOMAIN` and trusts Railway's proxy by default, so
   `QUITADO_BASE_URL` and `QUITADO_TRUST_PROXY` can be left out; set them yourself for a custom domain.
   A step-by-step guide in Portuguese is in [pt-BR/railway.md](./pt-BR/railway.md), and what a one-click
   template has to contain is in [railway-template.md](./railway-template.md).
5. **Domain:** add it under the service's networking settings. Railway shows a CNAME record **and** a
   TXT record that proves you own the domain; the domain will not verify with only one of them. For
   the root of a domain (no `www.` or other prefix) Railway supports ALIAS and CNAME flattening, so
   use an ALIAS record if your DNS provider has no CNAME at the root.
6. **A home page on another host name (optional).** To serve the project's home page from the same
   service, add a second custom domain (for example the bare `quitado.finance`, next to
   `pay.quitado.finance`) and set `QUITADO_SITE_HOST=quitado.finance`. That host shows the home page at
   `/` and sends every other path to `QUITADO_BASE_URL`, so the sign-in and the payment pages stay on
   the instance's own address. Leave the variable out and `/` goes to the sign-in as before.
7. **One replica only.** The database is a SQLite file on a volume, so do not scale the service to
   more than one instance.

There is no `railway.toml` in the repository on purpose: Railway has deprecated config-as-code
files, and everything above is set in the dashboard.

## Upgrading

`git pull && docker compose up -d --build`. The data volume is kept. On Railway, a new deployment
replaces the old one after the healthcheck passes.

## Backups

The invoices (client names, descriptions) exist only in the database: payments can be found again
on chain, invoices cannot. Back up regularly.

```bash
docker compose exec quitado node packages/server/dist/backup-cli.js
docker compose cp quitado:/data/backups ./backups      # copy them out of the server
```

The command takes a consistent snapshot while the app keeps running, writes one self-contained file
to `/data/backups/quitado-<UTC time>.db` (readable by its owner only), and opens the copy to check its
integrity. It never overwrites an existing file. Pass a path to choose the destination. It reads
`QUITADO_DB_PATH`, like the app.

A backup in the same volume as the database does not protect you from losing the volume, so copy it
somewhere else. To restore, stop the app, put the file at `QUITADO_DB_PATH` and start it again.

## Things to know before taking real money

- **The stablecoin issuers can freeze token accounts.** Both USDC and USDT have a freeze authority.
  That is a property of the tokens, not of Quitado, and nothing in a non-custodial app can prevent it.
- **Quitado never holds your funds or keys,** but you are responsible for the wallet that receives
  them and for the `.env` file and the access secret.
- **A payment smaller than the invoice does not settle it,** and two partial payments are not added
  together. The customer has to pay the full amount.
- **Receipts are not tax documents.** See [receipts.md](./receipts.md).

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
8. Take a first backup and confirm you can open the file.
