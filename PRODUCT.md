# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, one product.

- **The owner** is one person, a freelancer or very small business in Brazil, who bills clients in USDC or USDT on Solana. They run their own instance, sign in to `/admin` with a single access secret, create an invoice, send its link, and need to know at a glance which invoices are open, paid or overdue. They are not a team and there are no roles.
- **The payer** is the owner's client. They open a public `/pay/<id>` link on a phone or a computer, see who is asking for what amount, and pay from a Solana wallet by scanning the QR code or following the wallet link. Some payers already use crypto every day; some have never paid with USDC. The page has to serve both without slowing down the experienced one or losing the beginner.

## Product Purpose

Quitado is open-source, non-custodial invoicing for stablecoin payments on Solana. The owner creates an invoice, the client pays straight into the owner's own wallet, the server detects the payment on-chain and marks the invoice paid, and either side can download a PDF receipt. Success is an invoice that gets paid and is recognised as paid without the owner doing anything by hand, and a payer who is never unsure whether their payment went through.

## Positioning

Funds never touch Quitado. There is no custody, no account balance, no withdrawal step and no intermediary taking a fee: the recipient is a wallet address the owner configures, and every paid invoice points to a transaction anyone can check on a block explorer. It is software you run yourself (Apache-2.0), not a service you sign up for.

## Operating Context

- One Node process with a SQLite file; deployed from a Docker image. The reference instance runs on Railway at `pay.quitado.finance`, on Solana mainnet, behind HTTPS.
- Payments are detected from the recipient's token-account balance change plus a unique reference in the transaction, and settled only when the transaction is `finalized`. A payment can therefore take a short while to show as paid, and the interface has to make that waiting state clear and calm.
- Amounts are USDC and USDT with exact decimal handling. Invoice dates and receipts use a configured UTC offset (Brazil: -03:00).
- Strict Content-Security-Policy: `default-src 'none'`, scripts and styles only from `'self'`. There are no external fonts, CDNs, analytics or trackers, and none may be added. All markup is escaped server-side.

## Capabilities and Constraints

- Routes: `/admin` (invoice list), `/admin/stats`, new-invoice form, `/pay/<id>` (public payment page with QR and live status), `/pay/<id>/receipt.pdf`, `/healthz`, and `/` as the project's home page when the request host is `QUITADO_SITE_HOST` (otherwise `/` goes to the sign-in).
- Portuguese (Brazil) and English are both supported, side by side. The payment page and the home page pick the language from `?lang=`, then the visitor's browser, then English, and show a visible switch; no cookie. The owner's pages are still English only.
- Single owner, single access secret, no user accounts. Public pages are rate limited.
- Not a fiscal document: a receipt is proof of an on-chain payment, not a nota fiscal. Brazilian tax helpers (PTAX conversion, carnê-leão support, export) are planned, not built, and must not be implied by the interface.
- Only USDC and USDT are supported. The network (mainnet or devnet) is shown to the user where it matters.

## Brand Commitments

Only the name, **Quitado** (Portuguese for "settled, paid off"). No logo, palette, typography or voice has been fixed; the visual identity is open.

## Evidence on Hand

No customers, testimonials, usage numbers or case studies exist yet, and the interface must not display or imply any. The source of truth for what the product does is the code and the docs in `docs/`.

## Product Principles

1. **Trust before polish.** This page asks someone to send real money. Clarity about who is asking, how much, on which network and to which address matters more than decoration.
2. **Say what is happening.** An invoice is only ever `open` or `paid`, and "overdue" is derived (open and past its due date). Waiting for the payment to finalize, a payment that arrived but is too small, and an overdue invoice are normal situations, and each gets a plain explanation of what the payer or the owner should do next.
3. **Nothing hidden, nothing borrowed.** No third-party scripts, fonts or trackers, ever. Every claim the interface makes is something the server actually knows.
4. **One person, one task.** The admin is for a single owner doing a small set of jobs quickly; it should be fast to scan and never feel like enterprise software.
5. **Self-hosting is a feature.** The product should look and read well on an instance the owner runs themself, with the owner's own name or none at all.

## Accessibility & Inclusion

Payers are not a technical audience by default: plain language, no crypto jargon without a short explanation, readable on a phone in daylight, and usable with a keyboard and a screen reader. Both light and dark themes already exist and must stay supported.
