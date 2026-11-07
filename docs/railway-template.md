# A Railway template for Quitado

A template lets someone deploy their own instance from one link, with the volume, the variables and
the healthcheck already set. This page says what the template has to contain. The Portuguese
step-by-step guide for people who do it by hand is [pt-BR/railway.md](./pt-BR/railway.md).

What the template needs is checked against Railway's documentation (November 2026). Two things the
documentation does not say are marked **verify**: deploy the finished template once into a scratch
project and look.

## Build it from the repository, not from the live instance

Create it from scratch (workspace settings, **Templates**, **New Template**, add a service from the
**GitHub repo** `quitado-app/quitado`). Do not generate it from the project that runs a real
instance: that way nothing from a real instance (the access secret, the RPC key, the wallet) can end
up in a template that other people deploy.

## The service

| Setting           | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Source            | GitHub repo `quitado-app/quitado`, branch `main`; Railway builds the `Dockerfile` |
| Public networking | HTTP (a generated domain)                                                         |
| Healthcheck path  | `/healthz`                                                                        |
| Volume            | Attach a volume with the mount path `/data`                                       |
| Replicas          | One. The database is a SQLite file on the volume                                  |

Leave the start command empty: the image already starts the server.

## Variables

| Variable                     | Value in the template           | Why                                                                                   |
| ---------------------------- | ------------------------------- | ------------------------------------------------------------------------------------- |
| `QUITADO_RECIPIENT`          | empty, the deployer fills it in | The wallet that receives every payment. **Verify** that Railway asks for empty values |
| `QUITADO_RPC_URL`            | empty, the deployer fills it in | A dedicated RPC provider; the public one is rate limited. **Verify** as above         |
| `QUITADO_ACCESS_SECRET`      | `${{secret(32)}}`               | Generated at deploy time (at least 20 characters are required). Never hard-code one   |
| `RAILWAY_RUN_UID`            | `0`                             | Railway mounts volumes as root; the image runs as a non-root user                     |
| `QUITADO_UTC_OFFSET_MINUTES` | `-180`                          | Due dates end at 23:59 in Brasília time. Anyone outside Brazil changes it             |
| `QUITADO_OWNER_NAME`         | empty, optional                 | Shown as "From" on invoices                                                           |

`QUITADO_BASE_URL` and `QUITADO_TRUST_PROXY` are **not** set: when Railway provides
`RAILWAY_PUBLIC_DOMAIN` the app uses `https://<that domain>` as its public address and trusts
Railway's proxy for client addresses. Setting either one explicitly (for a custom domain) wins.

The deployer reads the generated access secret in the service's **Variables** tab. Say so in the
template's description.

## Publishing

A new template is private until it is published. Publishing lists it on Railway's marketplace under
the workspace's name, so decide that on purpose. The template's URL is what a "Deploy on Railway"
button in the README or the home page would link to; add the button only after a deploy from the
template has worked end to end in a scratch project, and note the template's URL here when it exists.

## Checklist before sharing it

1. Deploy it into a scratch project with a wallet and an RPC key of your own.
2. Open `/admin`, sign in with the generated secret, create a 1 USDC invoice and pay it.
3. Open the payment link and confirm it starts with the generated `https://...up.railway.app`
   address, not with `localhost`.
4. Check that the volume is attached (the invoice survives a redeploy).
5. Delete the scratch project.
