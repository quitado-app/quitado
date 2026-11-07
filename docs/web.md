# Web app: pages, access and security

Code: [`packages/server/src/web`](../packages/server/src/web), wired together in
[`instance.ts`](../packages/server/src/instance.ts). Configuration is read from `QUITADO_*`
environment variables; see [`.env.example`](../.env.example).

## Running it

```bash
cp .env.example .env     # then fill in QUITADO_RECIPIENT and QUITADO_ACCESS_SECRET
npm install
npm run build
npm start
```

By default it listens on `127.0.0.1:3000`. Open `/admin` and sign in with your access secret.

## What it does

- **Owner area** (`/admin`, sign-in required): list invoices, create one, copy its payment link, and see your usage numbers on `/admin/stats`: invoices issued, paid, open and past due, totals invoiced and received per token (exact, from the database), and payments per month. They are computed from this instance's own database and nothing is sent anywhere; there is no telemetry.
- **Payment page** (`/pay/<id>`, public, English or Brazilian Portuguese): shows the invoice, a QR
  code and a Solana Pay link, and refreshes itself when the payment is detected. The language
  follows `?lang=`, then the browser's language, then English. The page is the only thing a customer
  needs; they never see the owner area.
- **Home page** (`/`, only when `QUITADO_SITE_HOST` is set and the request is for that host): what
  Quitado is and does, in the same two languages, with no script and no outside resource. On every
  other host `/` goes to the sign-in.
- **Payment receipt** (`/pay/<id>/receipt.pdf`, public): a PDF the customer can download once the invoice is paid; see [receipts.md](./receipts.md).
- **Payment detection** runs in the same process; see [payment-detection.md](./payment-detection.md).

## Access model

One owner per instance, no accounts. The owner types a secret from the environment; the server
answers with a signed, expiring (12 h) cookie. Sessions are stateless, so changing the secret signs
everyone out.

- The secret is compared in constant time. Ten attempts per 15 minutes per client, then `429`.
- The cookie is `HttpOnly` and `SameSite=Strict`. Over https it is `Secure` and uses the `__Host-`
  prefix.
- State-changing requests must come from this instance (`Origin`, or `Referer` as a fallback).
- The id in `/pay/<id>` is 128 random bits and is the only protection of that page: anyone who has
  the link can see the invoice. Unknown ids and malformed ids get the same `404`.

## Other security choices

- **No framework.** The HTTP layer uses `node:http` and a small router. Express and its
  dependencies would have added about 65 packages to a security-sensitive project.
- **Escaping by default.** Everything the owner types (client, description) is shown on a public
  page, so every value goes through an escaping template; markup is only allowed where the code
  marks it explicitly (the QR SVG, which is generated from numbers). Tested with injection payloads.
- **Strict `Content-Security-Policy`:** scripts and styles only from this origin, no inline code, no
  third-party resources, no framing. `Strict-Transport-Security` is sent when the base URL is https.
- **`Referrer-Policy: same-origin`, not `no-referrer`.** With `no-referrer`, browsers send
  `Origin: null` on same-site form posts, which makes the origin check above refuse every form. This
  was found by running the app in a real browser, not by the tests. Nothing is sent to other sites,
  such as the block explorer.
- **Public pages are rate limited** per client (120 requests per minute). Behind a reverse proxy,
  set `QUITADO_TRUST_PROXY=true` so the real client IP is used; leave it off otherwise, because
  anyone can forge `X-Forwarded-For`.
- **Custom tokens are refused on mainnet.** `QUITADO_ASSETS` only works on devnet, so a typo or a
  hostile configuration cannot make the instance accept a look-alike token.
- Request bodies are capped (16 KiB), and unexpected errors return a generic page and never expose
  details.

## Solana Pay links

The payment URL is built by hand ([`solana-pay.ts`](../packages/server/src/web/solana-pay.ts)) so the
amount stays exact decimal text. A test compares it with `@solana/pay`: byte for byte when the text
has no spaces, and equal after parsing when it does. Spaces are encoded as `%20`, where
`@solana/pay` writes `+`; `%20` is read correctly by both `decodeURIComponent` and `URLSearchParams`,
while `+` only by the latter.

## Limits

- One instance, one owner, one wallet that receives payments.
- Rate limits and sessions live in memory of one process.
- The owner pages are in English or Brazilian Portuguese, by the same rule as the public pages (`?lang=`, then the browser, then English). Amounts and dates follow the language; the Solana Pay link and the owner's data do not.
- No recipient-side notification yet (email or webhook): the owner sees payments in the dashboard.

## Trying it on devnet

With the throwaway wallet from `packages/spike-devnet`, set `QUITADO_CLUSTER=devnet`,
`QUITADO_RECIPIENT` to the merchant address, and `QUITADO_ASSETS=TEST:<mint>:6` with the test mint from
`.keys/state.json`. Create an invoice in the browser, copy the `reference=` value from its payment
link and pay it:

```bash
cd packages/spike-devnet
node src/pay-invoice.ts <reference> <amount>
```

The payment page switches to "Invoice paid" on its own.
