# The Railway template for Quitado

A template lets someone deploy their own instance from one link, with the volume, the variables and
the healthcheck already set. It is published as **Deploy on Railway**: <https://railway.com/deploy/quitado>
(the button in the README and on the home page). The Portuguese step-by-step guide, for the button and
for doing it by hand, is [pt-BR/railway.md](./pt-BR/railway.md). The text shown on the marketplace page
is [railway-template-readme.md](./railway-template-readme.md).

## What the template contains

| Setting           | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Source            | GitHub repo `quitado-app/quitado`, branch `main`; Railway builds the `Dockerfile` |
| Public networking | HTTP, with a generated domain                                                     |
| Healthcheck path  | `/healthz`                                                                        |
| Volume            | Mount path `/data`                                                                |
| Replicas          | One. The database is a SQLite file on the volume                                  |

The start command is left empty: the image already starts the server.

| Variable                     | Value in the template | Why                                                                                 |
| ---------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `QUITADO_RECIPIENT`          | empty, required       | The wallet that receives every payment. The deployer fills it in                    |
| `QUITADO_RPC_URL`            | empty, required       | A dedicated RPC provider; the public one is rate limited                            |
| `QUITADO_ACCESS_SECRET`      | `${{secret(32)}}`     | Generated at deploy time (at least 20 characters are required). Never hard-code one |
| `RAILWAY_RUN_UID`            | `0`                   | Railway mounts volumes as root; the image runs as a non-root user                   |
| `QUITADO_UTC_OFFSET_MINUTES` | `-180`                | Due dates end at 23:59 in Brasília time. Anyone outside Brazil changes it           |
| `QUITADO_OWNER_NAME`         | empty, optional       | Shown as "From" on invoices                                                         |

`QUITADO_BASE_URL` and `QUITADO_TRUST_PROXY` are **not** set: when Railway provides
`RAILWAY_PUBLIC_DOMAIN` the app uses `https://<that domain>` as its public address and trusts Railway's
proxy for client addresses. Setting either one explicitly (for a custom domain) wins.

The deployer reads the generated access secret in the service's **Variables** tab.

## How it was made, and what to watch for when changing it

It was made from a throwaway project, never from the project that runs a real instance, so nothing from a
real instance (the access secret, the RPC key, the wallet) can end up in a template other people deploy:

1. Create a throwaway project with one service from the repository, the `/data` volume, the healthcheck and
   a generated domain, and no real values.
2. `railway templates create` makes an **unpublished draft** from it. Delete the throwaway project after.
3. Open the draft's editor (`railway.com/workspace/templates/<id>`) and fix the variables as in the table
   above, then name it and describe it (**Template Settings**; the description is limited to 75 characters).
   Apply the staged changes.
4. Test it (below), then `railway templates publish <code> --category Other --description "..." --readme-file
docs/railway-template-readme.md`. A first publication needs those README headings: `# Deploy and Host`,
   `## About Hosting`, `## Why Deploy`, `## Common Use Cases`, `## Dependencies for`, `### Deployment
Dependencies`. To change the metadata later use `railway templates update`.

Things learned on the way:

- Generating a template from a project **blanks every variable value**. That is why nothing sensitive is
  copied, and also why the fixed values (`RAILWAY_RUN_UID`, the offset) have to be typed in again.
- `${{secret(32)}}` is only a template function. Set in a normal project, it is evaluated at once and stored
  as one fixed value, which every deployer would then share. Add it in the template editor, never in a project.
- Publishing changes the template's code: the draft's code stops working and the public one is `quitado`.

## Checklist after any change

1. Deploy it into a scratch project (`railway deploy -t quitado -v QUITADO_RECIPIENT=... -v QUITADO_RPC_URL=...`
   in a linked scratch project) with a wallet address and an RPC URL of your own.
2. `/healthz` answers 200; sign in at `/admin` with the generated secret and create a 1 USDC invoice.
3. The payment link starts with the generated `https://...up.railway.app` address, not with `localhost`, and
   the payment page opens.
4. The volume is attached (the invoice survives a redeploy).
5. Delete the scratch project.
