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
  /** The owner menu entry for the page being shown, marked with aria-current. */
  current?: 'invoices' | 'new' | 'stats';
  /** The language switch, shown next to the owner navigation or on its own on public pages. */
  switcher?: Raw;
}): string {
  const lang = options.lang ?? 'en';
  const q = options.langQuery ?? '';
  const here = (entry: string) => (options.current === entry ? raw('aria-current="page"') : '');
  const banner =
    options.cluster === 'devnet' ? html`<div class="banner">${t(lang, 'devnetBanner')}</div>` : '';
  const nav = options.admin
    ? html`<nav aria-label="${t(lang, 'ownerMenu')}">
        <a href="/admin${q}" ${here('invoices')}>${t(lang, 'navInvoices')}</a>
        <a href="/admin/invoices/new${q}" ${here('new')}>${t(lang, 'navNewInvoice')}</a>
        <a href="/admin/stats${q}" ${here('stats')}>${t(lang, 'navStats')}</a>
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
        <a class="skip" href="#main">${t(lang, 'skipToContent')}</a>
        <div class="wrap">
          <header class="top">
            <span class="brand">Quitado</span>
            ${nav} ${options.switcher ?? ''}
          </header>
          <main id="main" tabindex="-1">${banner} ${options.body}</main>
          <footer>${t(lang, 'siteFooter')}</footer>
        </div>
        <span class="sr-only" id="live-status" role="status" aria-live="polite"></span>
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
    current: 'invoices',
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
    current: 'new',
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
    current: 'invoices',
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

/** What the /verify page shows: the form, or the result of checking one signature. */
export type VerifyView =
  | { state: 'form' }
  | { state: 'bad' | 'unknown'; signature: string }
  | {
      state: 'verified';
      signature: string;
      /** "0.10 USDC", read from the chain. */
      amount: string;
      recipient: string;
      payer?: string;
      /** The chain's own time of the block, formatted; absent when the cluster did not report it. */
      time?: string;
      explorerUrl: string;
    }
  | { state: 'mismatch' | 'unavailable'; signature: string; explorerUrl: string };

/**
 * Anyone can paste a payment's transaction signature and see what the Solana network itself says
 * about it. Nothing from the database is shown beyond the facts already public on the chain (no
 * client name, no description).
 */
export function verifyPage(ctx: PageContext, view: VerifyView): string {
  const lang = ctx.lang;
  const m = (key: MessageKey, params?: Record<string, string>) => t(lang, key, params);
  const typed = view.state === 'form' ? '' : view.signature;
  const form = html`<form method="get" action="/verify">
    <input type="hidden" name="lang" value="${lang}" />
    <label for="verify_tx">${m('verifyInputLabel')}</label>
    <input
      id="verify_tx"
      name="tx"
      class="mono"
      autocomplete="off"
      spellcheck="false"
      required
      maxlength="100"
      value="${typed}"
    />
    <p><button type="submit">${m('verifyButton')}</button></p>
  </form>`;

  let result: Raw | string = '';
  if (view.state === 'bad') {
    result = html`<div class="error" role="alert">${m('verifyBadSignature')}</div>`;
  } else if (view.state === 'unknown') {
    result = html`<div class="error" role="alert">${m('verifyUnknown')}</div>`;
  } else if (view.state === 'verified') {
    const network = ctx.cluster === 'devnet' ? m('networkDevnet') : m('networkMain');
    result = html`<div class="card" role="status">
      <h2><span class="chip chip-paid">${m('verifyOkTitle')}</span></h2>
      <p>${m('verifyOkText', { network })}</p>
      <span class="label">${m('verifyReceived')}</span>
      <p class="amount">${view.amount}</p>
      <span class="label">${m('recipient')}</span>
      <p class="mono">${view.recipient}</p>
      ${
        view.payer
          ? html`<span class="label">${m('verifyPaidFrom')}</span>
              <p class="mono">${view.payer}</p>`
          : ''
      }
      ${
        view.time
          ? html`<span class="label">${m('verifyBlockTime')}</span>
              <p>${view.time}</p>`
          : ''
      }
      <span class="label">${m('transaction')}</span>
      <p class="mono">${view.signature}</p>
      <p>
        <a href="${view.explorerUrl}" rel="noopener noreferrer">${m('viewTransaction')}</a>
      </p>
    </div>`;
  } else if (view.state === 'mismatch') {
    result = html`<div class="card" role="alert">
      <h2><span class="chip chip-overdue">${m('verifyMismatchTitle')}</span></h2>
      <p>${m('verifyMismatchText')}</p>
      <p><a href="${view.explorerUrl}" rel="noopener noreferrer">${m('viewTransaction')}</a></p>
    </div>`;
  } else if (view.state === 'unavailable') {
    result = html`<div class="card" role="alert">
      <h2><span class="chip chip-open">${m('verifyUnavailableTitle')}</span></h2>
      <p>${m('verifyUnavailableText')}</p>
    </div>`;
  }

  return layout({
    title: `${m('verifyPageTitle')} · Quitado`,
    cluster: ctx.cluster,
    lang,
    switcher: languageSwitch(lang, '/verify'),
    body: html`<h1>${m('verifyPageTitle')}</h1>
      <p class="muted">${m('verifyPageIntro')}</p>
      <div class="card">${form}</div>
      ${result}`,
  });
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
          <p>
            <a href="/verify?tx=${encodeURIComponent(payment.signature)}&amp;lang=${lang}"
              >${m('verifyAgain')}</a
            >
          </p>
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

  // A plain GET form: the browser builds /admin/export/paid.csv?year=..&month=..&lang=.. by itself,
  // so no script is needed. The language goes along as a field because a GET form replaces the
  // query of its action.
  const monthOptions = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return html`<option value="${month}">${month}</option>`;
  });
  const exportSection =
    stats.paid === 0
      ? ''
      : html`<h2>${m('exportHeading')}</h2>
          <div class="card">
            <p class="muted">${m('exportNote')}</p>
            <form method="get" action="/admin/export/paid.csv">
              <input type="hidden" name="lang" value="${lang}" />
              <label for="export_year">${m('exportYear')}</label>
              <input
                id="export_year"
                name="year"
                inputmode="numeric"
                pattern="2[0-9]{3}"
                maxlength="4"
                placeholder="${formatDate(ctx.now, ctx.utcOffsetMinutes).slice(0, 4)}"
                aria-describedby="export_year_hint"
              />
              <p class="muted" id="export_year_hint">${m('exportYearHint')}</p>
              <label for="export_month">${m('exportMonth')}</label>
              <select id="export_month" name="month">
                <option value="">${m('exportAllMonths')}</option>
                ${monthOptions}
              </select>
              <p><button type="submit">${m('exportDownload')}</button></p>
              <p class="muted">${m('exportSpreadsheetTip')}</p>
            </form>
          </div>`;

  return layout({
    title: `${m('statsTitle')} · Quitado`,
    cluster: ctx.cluster,
    admin: true,
    current: 'stats',
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
      }
      ${exportSection}`,
  });
}
