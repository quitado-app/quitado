import { isOverdue, type Asset, type Cluster, type Invoice } from '@quitado/core';
import { displayAmount, explorerTxUrl, formatDate, shorten } from './format.ts';
import { html, raw, type Raw } from './html.ts';
import { t, type Lang, type MessageKey } from './i18n.ts';
import type { InvoiceStats } from '../storage/stats.ts';

export interface PageContext {
  cluster: Cluster;
  utcOffsetMinutes: number;
  now: number;
  /** Language of the public pages. The owner pages are still English only. */
  lang: Lang;
}

function layout(options: {
  title: string;
  body: Raw;
  cluster: Cluster;
  admin?: boolean;
  lang?: Lang;
  /** Replaces the owner navigation, for pages that offer a language switch instead. */
  switcher?: Raw;
}): string {
  const lang = options.lang ?? 'en';
  const banner =
    options.cluster === 'devnet' ? html`<div class="banner">${t(lang, 'devnetBanner')}</div>` : '';
  const nav = options.admin
    ? html`<nav>
        <a href="/admin">Invoices</a>
        <a href="/admin/invoices/new">New invoice</a>
        <a href="/admin/stats">Stats</a>
        <form class="inline" method="post" action="/admin/logout">
          <button class="link" type="submit">Sign out</button>
        </form>
      </nav>`
    : '';
  return html`<!doctype html>
    <html lang="${lang}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>${options.title}</title>
        <link rel="icon" href="data:," />
        <link rel="stylesheet" href="/static/app.css" />
      </head>
      <body>
        <div class="wrap">
          <header class="top">
            <span class="brand">Quitado</span>
            ${nav} ${options.switcher ?? ''}
          </header>
          ${banner} ${options.body}
          <footer>${t(lang, 'siteFooter')}</footer>
        </div>
        <script src="/static/app.js" defer></script>
      </body>
    </html>`.value;
}

function statusChip(invoice: Invoice, now: number, lang: Lang = 'en'): Raw {
  if (invoice.status === 'paid') {
    return html`<span class="chip chip-paid">${t(lang, 'statusPaid')}</span>`;
  }
  return isOverdue(invoice, now)
    ? html`<span class="chip chip-overdue">${t(lang, 'statusOverdue')}</span>`
    : html`<span class="chip chip-open">${t(lang, 'statusOpen')}</span>`;
}

const amountOf = (invoice: Invoice, lang: Lang = 'en') =>
  `${displayAmount(invoice.amount, invoice.asset.decimals, lang)} ${invoice.asset.symbol}`;

export function loginPage(ctx: PageContext, error?: string): string {
  return layout({
    title: 'Sign in · Quitado',
    cluster: ctx.cluster,
    body: html`<div class="card">
      <h1>Sign in</h1>
      <p class="muted">Enter the access secret configured for this instance.</p>
      ${error ? html`<div class="error" role="alert">${error}</div>` : ''}
      <form method="post" action="/admin/login">
        <label for="secret">Access secret</label>
        <input id="secret" name="secret" type="password" autocomplete="current-password" required />
        <p><button type="submit">Sign in</button></p>
      </form>
    </div>`,
  });
}

export function dashboardPage(ctx: PageContext, invoices: readonly Invoice[]): string {
  const open = invoices.filter((invoice) => invoice.status === 'open').length;
  const rows = invoices.map(
    (invoice) =>
      html`<tr>
        <td>${invoice.clientName}</td>
        <td>
          ${invoice.description.length > 60 ? `${invoice.description.slice(0, 60)}…` : invoice.description}
        </td>
        <td class="num">${amountOf(invoice)}</td>
        <td class="nowrap">${formatDate(invoice.dueAt, ctx.utcOffsetMinutes)}</td>
        <td>${statusChip(invoice, ctx.now)}</td>
        <td><a href="/admin/invoices/${invoice.id}">View</a></td>
      </tr>`,
  );
  return layout({
    title: 'Invoices · Quitado',
    cluster: ctx.cluster,
    admin: true,
    body: html`<h1>Invoices</h1>
      <p class="muted">${invoices.length} shown, ${open} open.</p>
      ${
        invoices.length === 0
          ? html`<div class="card">
              <p>No invoices yet.</p>
              <a class="button" href="/admin/invoices/new">Create your first invoice</a>
            </div>`
          : html`<div class="card">
              <table>
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Description</th>
                    <th class="num">Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>`
      }`,
  });
}

export interface NewInvoiceValues {
  clientName: string;
  description: string;
  assetSymbol: string;
  amount: string;
  dueDate: string;
}

export function newInvoicePage(
  ctx: PageContext,
  assets: readonly Asset[],
  values: NewInvoiceValues,
  error?: string,
): string {
  const options = assets.map(
    (asset) =>
      html`<option
        value="${asset.symbol}"
        ${asset.symbol === values.assetSymbol ? raw('selected') : ''}
      >
        ${asset.symbol}
      </option>`,
  );
  return layout({
    title: 'New invoice · Quitado',
    cluster: ctx.cluster,
    admin: true,
    body: html`<h1>New invoice</h1>
      <div class="card">
        ${error ? html`<div class="error" role="alert">${error}</div>` : ''}
        <form method="post" action="/admin/invoices">
          <label for="client_name">Client</label>
          <input
            id="client_name"
            name="client_name"
            maxlength="200"
            required
            value="${values.clientName}"
          />
          <label for="description">Description</label>
          <textarea id="description" name="description" maxlength="1000" required>
${values.description}</textarea>
          <label for="asset">Token</label>
          <select id="asset" name="asset">
            ${options}
          </select>
          <label for="amount">Amount</label>
          <input
            id="amount"
            name="amount"
            inputmode="decimal"
            placeholder="1250.00"
            required
            value="${values.amount}"
          />
          <label for="due_date">Due date</label>
          <input id="due_date" name="due_date" type="date" required value="${values.dueDate}" />
          <p><button type="submit">Create invoice</button></p>
        </form>
      </div>`,
  });
}

// The script in assets.ts polls this URL for any element with this id and reloads once the invoice is
// paid. The id is generated by the server (base64url), the encoding is only a second guard.
function liveStatusAttributes(invoiceId: string) {
  return raw(`id="pay-root" data-status-url="/api/pay/${encodeURIComponent(invoiceId)}/status"`);
}

export function invoiceDetailPage(ctx: PageContext, invoice: Invoice, payUrl: string): string {
  const payment = invoice.payment;
  return layout({
    title: `Invoice for ${invoice.clientName} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    body: html`<h1>Invoice for ${invoice.clientName}</h1>
      <div class="card" ${payment ? '' : liveStatusAttributes(invoice.id)}>
        <div class="amount">${amountOf(invoice)}</div>
        <p>${statusChip(invoice, ctx.now)}</p>
        <p>${invoice.description}</p>
        <div class="row">
          <div>
            <span class="label">Created</span>${formatDate(invoice.createdAt, ctx.utcOffsetMinutes)}
          </div>
          <div>
            <span class="label">Due</span>${formatDate(invoice.dueAt, ctx.utcOffsetMinutes)}
          </div>
        </div>
      </div>
      <div class="card">
        <h2>Payment link</h2>
        <p class="muted">Send this link to your client. Anyone who has it can see this invoice.</p>
        <div class="copy-row">
          <span class="mono">${payUrl}</span>
          <button class="secondary" type="button" data-copy="${payUrl}">Copy</button>
          <a class="button secondary" href="${payUrl}">Open</a>
        </div>
        ${
          payment
            ? ''
            : html`<p class="muted">This page updates by itself when the payment is detected.</p>`
        }
      </div>
      ${
        payment
          ? html`<div class="card">
              <h2>Payment received</h2>
              <div class="row">
                <div>
                  <span class="label">Amount received</span
                  >${displayAmount(payment.amount, invoice.asset.decimals)} ${invoice.asset.symbol}
                </div>
                <div>
                  <span class="label">Received</span
                  >${formatDate(payment.receivedAt, ctx.utcOffsetMinutes)}
                </div>
                ${
                  payment.payer
                    ? html`<div>
                        <span class="label">From</span
                        ><span class="mono">${shorten(payment.payer)}</span>
                      </div>`
                    : ''
                }
              </div>
              <p>
                <a href="${explorerTxUrl(payment.signature, ctx.cluster)}" rel="noopener noreferrer"
                  >View the transaction in the explorer</a
                >
              </p>
              <p>
                <a class="button" href="/pay/${invoice.id}/receipt.pdf">Download receipt (PDF)</a>
              </p>
            </div>`
          : ''
      }`,
  });
}

export interface PayPageData {
  invoice: Invoice;
  /** Who is asking for the money: the configured owner name, or this site's own host name. */
  issuer: string;
  recipient: string;
  /** solana: URL for the QR code and the "open in wallet" button. */
  paymentUrl: string;
  qrSvg: string;
  statusUrl: string;
}

/** Language switch for the public pages. Plain links, so it works without JavaScript or cookies. */
function languageSwitch(lang: Lang): Raw {
  const link = (target: Lang, label: string) =>
    html`<a
      href="?lang=${target}"
      lang="${target}"
      hreflang="${target}"
      ${target === lang ? raw('aria-current="true"') : ''}
      >${label}</a
    >`;
  return html`<nav class="lang" aria-label="${t(lang, 'languageLabel')}">
    ${link('en', 'English')} ${link('pt-BR', 'Português')}
  </nav>`;
}

export function payPage(ctx: PageContext, data: PayPageData): string {
  const { invoice, issuer } = data;
  const payment = invoice.payment;
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
  const amount = amountOf(invoice, lang);
  const devnet = ctx.cluster === 'devnet';
  const token = invoice.asset.symbol;

  const details = html`<div class="row">
      <div><span class="label">${m('from')}</span>${issuer}</div>
      <div><span class="label">${m('billedTo')}</span>${invoice.clientName}</div>
      <div>
        <span class="label">${m('due')}</span
        >${formatDate(invoice.dueAt, ctx.utcOffsetMinutes, lang)}
      </div>
    </div>
    <p>${invoice.description}</p>`;

  const body = payment
    ? html`<div class="card" id="pay-root">
          <h1>${m('invoicePaid')}</h1>
          <div class="amount">${amount}</div>
          <p>${statusChip(invoice, ctx.now, lang)}</p>
          ${details}
          <p>
            ${m('paymentReceived', { date: formatDate(payment.receivedAt, ctx.utcOffsetMinutes, lang) })}
            <a href="${explorerTxUrl(payment.signature, ctx.cluster)}" rel="noopener noreferrer"
              >${m('viewTransaction')}</a
            >
          </p>
          <p><a class="button" href="/pay/${invoice.id}/receipt.pdf">${m('downloadReceipt')}</a></p>
        </div>
        <div class="card">
          <h2>${m('verifyHeading')}</h2>
          <div class="row">
            <div>
              <span class="label">${m('network')}</span
              >${devnet ? m('networkDevnet') : m('networkMain')}
            </div>
            <div><span class="label">${m('token')}</span>${token}</div>
          </div>
          <span class="label">${m('recipient')}</span>
          <p class="mono">${data.recipient}</p>
          <span class="label">${m('tokenAddress')}</span>
          <p class="mono">${invoice.asset.mint}</p>
          <span class="label">${m('transaction')}</span>
          <p class="mono">${payment.signature}</p>
          <p class="muted">${m('verifyNote')}</p>
        </div>`
    : html`<div
          class="card"
          id="pay-root"
          data-status-url="${data.statusUrl}"
          data-paid-text="${m('detected')}"
        >
          <h1>${m('invoiceFrom', { issuer })}</h1>
          <div class="amount">${amount}</div>
          <p>${statusChip(invoice, ctx.now, lang)}</p>
          ${
            isOverdue(invoice, ctx.now)
              ? html`<p class="muted">
                  ${m('pastDueNote', { date: formatDate(invoice.dueAt, ctx.utcOffsetMinutes, lang) })}
                </p>`
              : ''
          }
          ${details}
        </div>
        <div class="card">
          <h2>${m('payHeading')}</h2>
          <p><a class="button button-block" href="${data.paymentUrl}">${m('openInWallet')}</a></p>
          <p class="muted">${m('payNote')}</p>
          <p class="status" id="pay-status" role="status" aria-live="polite">${m('waiting')}</p>
          <details class="more" id="qr-details" open>
            <summary>${m('qrSummary')}</summary>
            <div class="qr" role="img" aria-label="${m('qrLabel')}">${raw(data.qrSvg)}</div>
            <p class="muted">${m('qrHint')}</p>
          </details>
          <details class="more">
            <summary>${m('newTo', { token })}</summary>
            <ol>
              <li>${m('newStep1', { token })}</li>
              <li>${m('newStep2')}</li>
              <li>${m('newStep3')}</li>
            </ol>
          </details>
        </div>
        <div class="card">
          <h2>${m('detailsHeading')}</h2>
          <div class="row">
            <div>
              <span class="label">${m('network')}</span
              >${devnet ? m('networkDevnet') : m('networkMain')}
            </div>
            <div><span class="label">${m('token')}</span>${token}</div>
            <div>
              <span class="label">${m('amount')}</span
              >${displayAmount(invoice.amount, invoice.asset.decimals, lang)}
            </div>
          </div>
          <span class="label">${m('recipient')}</span>
          <div class="copy-row">
            <span class="mono">${data.recipient}</span>
            <button
              class="secondary"
              type="button"
              data-copy="${data.recipient}"
              data-copied="${m('copied')}"
            >
              ${m('copy')}
            </button>
          </div>
          <p class="muted">${m(devnet ? 'detailsNoteDevnet' : 'detailsNoteMain', { amount })}</p>
        </div>`;

  return layout({
    title: `${m('pageTitle', { amount, issuer })} · Quitado`,
    cluster: ctx.cluster,
    lang,
    switcher: languageSwitch(lang),
    body,
  });
}

export function messagePage(
  cluster: Cluster,
  title: string,
  message: string,
  options: { admin?: boolean } = {},
): string {
  return layout({
    title: `${title} · Quitado`,
    cluster,
    ...(options.admin ? { admin: true } : {}),
    body: html`<div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>`,
  });
}

export function statsPage(ctx: PageContext, stats: InvoiceStats): string {
  const paidShare = stats.total === 0 ? '0%' : `${Math.round((stats.paid / stats.total) * 100)}%`;
  const tile = (label: string, value: string | number) =>
    html`<div class="tile">
      <span class="label">${label}</span><span class="figure">${value}</span>
    </div>`;

  const assetRows = stats.byAsset.map(
    (asset) =>
      html`<tr>
        <td>${asset.symbol}</td>
        <td class="num">${asset.invoices}</td>
        <td class="num">${asset.paid}</td>
        <td class="num">${displayAmount(asset.invoiced, asset.decimals)}</td>
        <td class="num">${displayAmount(asset.received, asset.decimals)}</td>
      </tr>`,
  );
  const monthRows = stats.byMonth.map(
    (entry) =>
      html`<tr>
        <td>${entry.month}</td>
        <td>${entry.symbol}</td>
        <td class="num">${entry.payments}</td>
        <td class="num">${displayAmount(entry.received, entry.decimals)}</td>
      </tr>`,
  );

  return layout({
    title: 'Stats · Quitado',
    cluster: ctx.cluster,
    admin: true,
    body: html`<h1>Stats</h1>
      <p class="muted">
        Computed from this instance's own database. Nothing is sent anywhere. Months follow the
        instance's UTC offset.
      </p>
      <div class="tiles">
        ${tile('Invoices issued', stats.total)} ${tile('Paid', `${stats.paid} (${paidShare})`)}
        ${tile('Open', stats.open)} ${tile('Past due', stats.overdue)}
      </div>
      ${
        stats.total === 0
          ? html`<div class="card"><p>No invoices yet, so there is nothing to total.</p></div>`
          : html`<h2>By token</h2>
              <div class="card">
                <table>
                  <thead>
                    <tr>
                      <th>Token</th>
                      <th class="num">Invoices</th>
                      <th class="num">Paid</th>
                      <th class="num">Invoiced</th>
                      <th class="num">Received</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${assetRows}
                  </tbody>
                </table>
              </div>
              <h2>Payments by month</h2>
              <div class="card">
                ${
                  stats.byMonth.length === 0
                    ? html`<p>No payments received yet.</p>`
                    : html`<table>
                        <thead>
                          <tr>
                            <th>Month</th>
                            <th>Token</th>
                            <th class="num">Payments</th>
                            <th class="num">Received</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${monthRows}
                        </tbody>
                      </table>`
                }
              </div>`
      }`,
  });
}
