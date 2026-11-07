import { isOverdue, type Asset, type Cluster, type Invoice } from '@quitado/core';
import { displayAmount, explorerTxUrl, formatDate, shorten } from './format.ts';
import { html, raw, type Raw } from './html.ts';
import { t, type Lang, type MessageKey } from './i18n.ts';
import type { InvoiceStats } from '../storage/stats.ts';

export interface PageContext {
  cluster: Cluster;
  utcOffsetMinutes: number;
  now: number;
  /** Language of the page: the visitor's choice, else their browser's, else English. */
  lang: Lang;
  /**
   * "?lang=pt-BR" when the language was chosen in the address, otherwise "". Owner links and form
   * actions carry it, so a language picked with the switch survives navigation without a cookie.
   */
  langQuery: string;
}

function layout(options: {
  title: string;
  body: Raw;
  cluster: Cluster;
  admin?: boolean;
  lang?: Lang;
  /** Added to the owner's navigation links; see PageContext. */
  langQuery?: string;
  /** The language switch, shown next to the owner navigation or on its own on public pages. */
  switcher?: Raw;
}): string {
  const lang = options.lang ?? 'en';
  const q = options.langQuery ?? '';
  const banner =
    options.cluster === 'devnet' ? html`<div class="banner">${t(lang, 'devnetBanner')}</div>` : '';
  const nav = options.admin
    ? html`<nav aria-label="Quitado">
        <a href="/admin${q}">${t(lang, 'navInvoices')}</a>
        <a href="/admin/invoices/new${q}">${t(lang, 'navNewInvoice')}</a>
        <a href="/admin/stats${q}">${t(lang, 'navStats')}</a>
        <form class="inline" method="post" action="/admin/logout${q}">
          <button class="link" type="submit">${t(lang, 'navSignOut')}</button>
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
  const lang = ctx.lang;
  return layout({
    title: `${t(lang, 'loginTitle')} · Quitado`,
    cluster: ctx.cluster,
    lang,
    switcher: languageSwitch(lang, '/admin/login'),
    body: html`<div class="card">
      <h1>${t(lang, 'loginTitle')}</h1>
      <p class="muted">${t(lang, 'loginIntro')}</p>
      ${error ? html`<div class="error" role="alert">${error}</div>` : ''}
      <form method="post" action="/admin/login${ctx.langQuery}">
        <label for="secret">${t(lang, 'loginSecret')}</label>
        <input id="secret" name="secret" type="password" autocomplete="current-password" required />
        <p><button type="submit">${t(lang, 'loginSubmit')}</button></p>
      </form>
    </div>`,
  });
}

export function dashboardPage(ctx: PageContext, invoices: readonly Invoice[]): string {
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
  const open = invoices.filter((invoice) => invoice.status === 'open').length;
  // On a phone the table turns into one block per invoice; each cell then names itself with its
  // data-label, and the roles keep the table semantics that display: block would otherwise drop.
  const rows = invoices.map(
    (invoice) =>
      html`<tr role="row">
        <td role="cell" data-label="${m('colClient')}" class="stack-title">
          ${invoice.clientName}
        </td>
        <td role="cell" data-label="${m('colDescription')}" class="stack-wide">
          ${invoice.description.length > 60 ? `${invoice.description.slice(0, 60)}…` : invoice.description}
        </td>
        <td role="cell" data-label="${m('colAmount')}" class="num">${amountOf(invoice, lang)}</td>
        <td role="cell" data-label="${m('due')}" class="nowrap stack-due">
          ${formatDate(invoice.dueAt, ctx.utcOffsetMinutes, lang)}
        </td>
        <td role="cell" data-label="${m('colStatus')}" class="stack-status">
          ${statusChip(invoice, ctx.now, lang)}
        </td>
        <td role="cell" class="stack-action">
          <a href="/admin/invoices/${invoice.id}${ctx.langQuery}">${m('view')}</a>
        </td>
      </tr>`,
  );
  return layout({
    title: `${m('invoicesTitle')} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    lang,
    langQuery: ctx.langQuery,
    switcher: languageSwitch(lang, '/admin'),
    body: html`<h1>${m('invoicesTitle')}</h1>
      <p class="muted">
        ${m('invoicesCount', { count: String(invoices.length), open: String(open) })}
      </p>
      ${
        invoices.length === 0
          ? html`<div class="card">
              <p>${m('noInvoices')}</p>
              <a class="button" href="/admin/invoices/new${ctx.langQuery}">${m('createFirst')}</a>
            </div>`
          : html`<div class="card">
              <table class="stack" role="table">
                <thead>
                  <tr role="row">
                    <th role="columnheader">${m('colClient')}</th>
                    <th role="columnheader">${m('colDescription')}</th>
                    <th role="columnheader" class="num">${m('colAmount')}</th>
                    <th role="columnheader">${m('due')}</th>
                    <th role="columnheader">${m('colStatus')}</th>
                    <th role="columnheader"></th>
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
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
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
    title: `${m('newInvoiceTitle')} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    lang,
    langQuery: ctx.langQuery,
    switcher: languageSwitch(lang, '/admin/invoices/new'),
    body: html`<h1>${m('newInvoiceTitle')}</h1>
      <div class="card">
        ${error ? html`<div class="error" role="alert">${error}</div>` : ''}
        <form method="post" action="/admin/invoices${ctx.langQuery}">
          <label for="client_name">${m('fieldClient')}</label>
          <input
            id="client_name"
            name="client_name"
            maxlength="200"
            required
            value="${values.clientName}"
          />
          <label for="description">${m('fieldDescription')}</label>
          <textarea id="description" name="description" maxlength="1000" required>
${values.description}</textarea>
          <label for="asset">${m('fieldToken')}</label>
          <select id="asset" name="asset">
            ${options}
          </select>
          <label for="amount">${m('fieldAmount')}</label>
          <input
            id="amount"
            name="amount"
            inputmode="decimal"
            placeholder="1250.00"
            required
            value="${values.amount}"
          />
          <label for="due_date">${m('fieldDueDate')}</label>
          <input id="due_date" name="due_date" type="date" required value="${values.dueDate}" />
          <p><button type="submit">${m('createInvoice')}</button></p>
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
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
  const title = m('invoiceFor', { client: invoice.clientName });
  return layout({
    title: `${title} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    lang,
    langQuery: ctx.langQuery,
    switcher: languageSwitch(lang, `/admin/invoices/${invoice.id}`),
    body: html`<h1>${title}</h1>
      <div class="card" ${payment ? '' : liveStatusAttributes(invoice.id)}>
        <div class="amount">${amountOf(invoice, lang)}</div>
        <p>${statusChip(invoice, ctx.now, lang)}</p>
        <p>${invoice.description}</p>
        <div class="row">
          <div>
            <span class="label">${m('created')}</span
            >${formatDate(invoice.createdAt, ctx.utcOffsetMinutes, lang)}
          </div>
          <div>
            <span class="label">${m('due')}</span
            >${formatDate(invoice.dueAt, ctx.utcOffsetMinutes, lang)}
          </div>
        </div>
      </div>
      <div class="card">
        <h2>${m('paymentLinkHeading')}</h2>
        <p class="muted">${m('paymentLinkNote')}</p>
        <div class="copy-row">
          <span class="mono">${payUrl}</span>
          <button
            class="secondary"
            type="button"
            data-copy="${payUrl}"
            data-copied="${m('copied')}"
          >
            ${m('copy')}
          </button>
          <a class="button secondary" href="${payUrl}">${m('openLink')}</a>
        </div>
        ${payment ? '' : html`<p class="muted">${m('updatesByItself')}</p>`}
      </div>
      ${
        payment
          ? html`<div class="card">
              <h2>${m('paymentReceivedHeading')}</h2>
              <div class="row">
                <div>
                  <span class="label">${m('amountReceived')}</span
                  >${displayAmount(payment.amount, invoice.asset.decimals, lang)}
                  ${invoice.asset.symbol}
                </div>
                <div>
                  <span class="label">${m('receivedOn')}</span
                  >${formatDate(payment.receivedAt, ctx.utcOffsetMinutes, lang)}
                </div>
                ${
                  payment.payer
                    ? html`<div>
                        <span class="label">${m('from')}</span
                        ><span class="mono">${shorten(payment.payer)}</span>
                      </div>`
                    : ''
                }
              </div>
              <p>
                <a href="${explorerTxUrl(payment.signature, ctx.cluster)}" rel="noopener noreferrer"
                  >${m('viewInExplorer')}</a
                >
              </p>
              <p>
                <a class="button" href="/pay/${invoice.id}/receipt.pdf${ctx.langQuery}"
                  >${m('downloadReceipt')}</a
                >
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

/** Language switch for every page. Plain links, so it works without JavaScript or cookies. */
function languageSwitch(lang: Lang, path = ''): Raw {
  const link = (target: Lang, label: string) =>
    html`<a
      href="${path}?lang=${target}"
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
          <p>
            <a class="button" href="/pay/${invoice.id}/receipt.pdf?lang=${lang}"
              >${m('downloadReceipt')}</a
            >
          </p>
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
  options: { admin?: boolean; lang?: Lang } = {},
): string {
  return layout({
    title: `${title} · Quitado`,
    cluster,
    lang: options.lang ?? 'en',
    ...(options.admin ? { admin: true } : {}),
    body: html`<div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
    </div>`,
  });
}

export function statsPage(ctx: PageContext, stats: InvoiceStats): string {
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
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
        <td class="num">${displayAmount(asset.invoiced, asset.decimals, lang)}</td>
        <td class="num">${displayAmount(asset.received, asset.decimals, lang)}</td>
      </tr>`,
  );
  const monthRows = stats.byMonth.map(
    (entry) =>
      html`<tr>
        <td>${entry.month}</td>
        <td>${entry.symbol}</td>
        <td class="num">${entry.payments}</td>
        <td class="num">${displayAmount(entry.received, entry.decimals, lang)}</td>
      </tr>`,
  );

  return layout({
    title: `${m('statsTitle')} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    lang,
    langQuery: ctx.langQuery,
    switcher: languageSwitch(lang, '/admin/stats'),
    body: html`<h1>${m('statsTitle')}</h1>
      <p class="muted">${m('statsNote')}</p>
      <div class="tiles">
        ${tile(m('statsIssued'), stats.total)}
        ${tile(m('statusPaid'), `${stats.paid} (${paidShare})`)}
        ${tile(m('statusOpen'), stats.open)} ${tile(m('statusOverdue'), stats.overdue)}
      </div>
      ${
        stats.total === 0
          ? html`<div class="card"><p>${m('statsNoInvoices')}</p></div>`
          : html`<h2>${m('byToken')}</h2>
              <div class="card table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>${m('token')}</th>
                      <th class="num">${m('colInvoices')}</th>
                      <th class="num">${m('statusPaid')}</th>
                      <th class="num">${m('colInvoiced')}</th>
                      <th class="num">${m('colReceived')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${assetRows}
                  </tbody>
                </table>
              </div>
              <h2>${m('paymentsByMonth')}</h2>
              <div class="card table-scroll">
                ${
                  stats.byMonth.length === 0
                    ? html`<p>${m('noPayments')}</p>`
                    : html`<table>
                        <thead>
                          <tr>
                            <th>${m('colMonth')}</th>
                            <th>${m('token')}</th>
                            <th class="num">${m('colPayments')}</th>
                            <th class="num">${m('colReceived')}</th>
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
