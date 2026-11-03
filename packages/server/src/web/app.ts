// HTTP layer on node:http with a tiny router. No framework on purpose: the app has a handful of
// routes, and every dependency is attack surface in a public, security-sensitive project.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import {
  AmountError,
  AssetError,
  createInvoice,
  InvoiceError,
  isOverdue,
  type AssetRegistry,
} from '@quitado/core';
import type { Config } from '../config.ts';
import type { InvoiceStore } from '../storage/index.ts';
import { APP_CSS, APP_JS } from './assets.ts';
import { createRateLimiter, type Auth, type RateLimiter } from './auth.ts';
import { endOfDay, explorerTxUrl, formatDate } from './format.ts';
import {
  BodyTooLargeError,
  isSameOrigin,
  parseCookies,
  parseForm,
  readBody,
  serializeCookie,
} from './http-utils.ts';
import { newInvoiceId, newReference } from './ids.ts';
import {
  dashboardPage,
  invoiceDetailPage,
  loginPage,
  messagePage,
  newInvoicePage,
  payPage,
  statsPage,
  type NewInvoiceValues,
  type PageContext,
} from './pages.ts';
import { buildReceiptPdf } from '../receipt/receipt.ts';
import { qrSvg } from './qr.ts';
import { buildPaymentUrl } from './solana-pay.ts';

export type AppConfig = Pick<
  Config,
  'baseUrl' | 'recipient' | 'cluster' | 'ownerName' | 'utcOffsetMinutes' | 'trustProxy'
>;

export interface AppDeps {
  config: AppConfig;
  store: InvoiceStore;
  registry: AssetRegistry;
  auth: Auth;
  now?: () => number;
  loginLimiter?: RateLimiter;
  publicLimiter?: RateLimiter;
  newId?: () => string;
  newReference?: () => string;
  onError?: (error: unknown) => void;
}

interface Context {
  request: IncomingMessage;
  response: ServerResponse;
  path: string;
  ip: string;
  now: number;
}

type Handler = (ctx: Context, match: RegExpExecArray) => Promise<void> | void;

interface Route {
  method: 'GET' | 'POST';
  pattern: RegExp;
  handler: Handler;
}

const ID = '([A-Za-z0-9_-]{22})';
const FORM_LIMIT = 16 * 1024;

export function createWebServer(deps: AppDeps): Server {
  const { config, store, registry, auth } = deps;
  const clock = deps.now ?? Date.now;
  const makeId = deps.newId ?? newInvoiceId;
  const makeReference = deps.newReference ?? newReference;
  const loginLimiter = deps.loginLimiter ?? createRateLimiter({ max: 10, windowMs: 15 * 60_000 });
  const publicLimiter = deps.publicLimiter ?? createRateLimiter({ max: 120, windowMs: 60_000 });

  const https = config.baseUrl.startsWith('https://');
  // The __Host- prefix makes browsers refuse the cookie unless it is Secure, host-only and Path=/.
  const cookieName = https ? '__Host-quitado_session' : 'quitado_session';

  const securityHeaders: Record<string, string> = {
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
      "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    'X-Content-Type-Options': 'nosniff',
    // Not 'no-referrer': with it browsers send "Origin: null" on same-site form posts, which would
    // break the CSRF origin check. 'same-origin' still sends nothing to other sites (explorer links).
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Frame-Options': 'DENY',
    ...(https ? { 'Strict-Transport-Security': 'max-age=15552000' } : {}),
  };

  const pageContext = (ctx: Context): PageContext => ({
    cluster: config.cluster,
    utcOffsetMinutes: config.utcOffsetMinutes,
    now: ctx.now,
  });

  function send(
    ctx: Context,
    status: number,
    body: string | Buffer,
    type = 'text/html; charset=utf-8',
    headers: Record<string, string | string[]> = {},
  ): void {
    ctx.response.writeHead(status, {
      ...securityHeaders,
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      ...headers,
    });
    ctx.response.end(body);
  }

  const redirect = (ctx: Context, location: string, headers: Record<string, string> = {}) => {
    ctx.response.writeHead(303, {
      ...securityHeaders,
      Location: location,
      'Cache-Control': 'no-store',
      ...headers,
    });
    ctx.response.end();
  };

  const notFound = (ctx: Context) =>
    send(ctx, 404, messagePage(config.cluster, 'Not found', 'This page does not exist.'));

  const isAuthed = (ctx: Context) =>
    auth.verifySession(parseCookies(ctx.request.headers.cookie).get(cookieName), ctx.now);

  /** Wraps an admin handler: sign-in required, and writes must come from this same origin. */
  const admin =
    (handler: Handler, options: { write?: boolean } = {}): Handler =>
    (ctx, match) => {
      if (options.write && !isSameOrigin(ctx.request, config.baseUrl)) {
        return send(
          ctx,
          403,
          messagePage(config.cluster, 'Forbidden', 'Cross-site request refused.'),
        );
      }
      if (!isAuthed(ctx)) return redirect(ctx, '/admin/login');
      return handler(ctx, match);
    };

  const payUrlFor = (id: string) => `${config.baseUrl}/pay/${id}`;

  // ---- Owner pages -------------------------------------------------------------------------

  const emptyForm = (ctx: Context): NewInvoiceValues => ({
    clientName: '',
    description: '',
    assetSymbol: registry.list()[0]?.symbol ?? '',
    amount: '',
    dueDate: formatDate(ctx.now + 14 * 86_400_000, config.utcOffsetMinutes),
  });

  const routes: Route[] = [
    {
      method: 'GET',
      pattern: /^\/$/,
      handler: (ctx) => redirect(ctx, '/admin'),
    },
    {
      method: 'GET',
      pattern: /^\/healthz$/,
      handler: (ctx) => send(ctx, 200, JSON.stringify({ ok: true }), 'application/json'),
    },
    {
      method: 'GET',
      pattern: /^\/static\/app\.css$/,
      handler: (ctx) =>
        send(ctx, 200, APP_CSS, 'text/css; charset=utf-8', {
          'Cache-Control': 'public, max-age=300',
        }),
    },
    {
      method: 'GET',
      pattern: /^\/static\/app\.js$/,
      handler: (ctx) =>
        send(ctx, 200, APP_JS, 'text/javascript; charset=utf-8', {
          'Cache-Control': 'public, max-age=300',
        }),
    },

    {
      method: 'GET',
      pattern: /^\/admin\/login$/,
      handler: (ctx) =>
        isAuthed(ctx) ? redirect(ctx, '/admin') : send(ctx, 200, loginPage(pageContext(ctx))),
    },
    {
      method: 'POST',
      pattern: /^\/admin\/login$/,
      handler: async (ctx) => {
        if (!isSameOrigin(ctx.request, config.baseUrl)) {
          return send(
            ctx,
            403,
            messagePage(config.cluster, 'Forbidden', 'Cross-site request refused.'),
          );
        }
        const attempt = loginLimiter.take(ctx.ip);
        if (!attempt.allowed) {
          return send(
            ctx,
            429,
            messagePage(config.cluster, 'Too many attempts', 'Wait a few minutes and try again.'),
            'text/html; charset=utf-8',
            { 'Retry-After': String(attempt.retryAfterSeconds) },
          );
        }
        const form = parseForm(await readBody(ctx.request, 2 * 1024));
        if (!auth.verifySecret(form.get('secret') ?? '')) {
          // One generic message for every failure: never reveal why it was refused.
          return send(ctx, 401, loginPage(pageContext(ctx), 'Incorrect access secret.'));
        }
        const session = auth.createSession(ctx.now);
        redirect(ctx, '/admin', {
          'Set-Cookie': serializeCookie(cookieName, session.value, {
            maxAgeSeconds: session.maxAgeSeconds,
            secure: https,
          }),
        });
      },
    },
    {
      method: 'POST',
      pattern: /^\/admin\/logout$/,
      handler: (ctx) => {
        if (!isSameOrigin(ctx.request, config.baseUrl)) {
          return send(
            ctx,
            403,
            messagePage(config.cluster, 'Forbidden', 'Cross-site request refused.'),
          );
        }
        redirect(ctx, '/admin/login', {
          'Set-Cookie': serializeCookie(cookieName, '', { maxAgeSeconds: 0, secure: https }),
        });
      },
    },

    {
      method: 'GET',
      pattern: /^\/admin$/,
      handler: admin((ctx) =>
        send(ctx, 200, dashboardPage(pageContext(ctx), store.list({ limit: 200 }))),
      ),
    },
    {
      method: 'GET',
      pattern: /^\/admin\/invoices\/new$/,
      handler: admin((ctx) =>
        send(ctx, 200, newInvoicePage(pageContext(ctx), registry.list(), emptyForm(ctx))),
      ),
    },
    {
      method: 'POST',
      pattern: /^\/admin\/invoices$/,
      handler: admin(
        async (ctx) => {
          const form = parseForm(await readBody(ctx.request, FORM_LIMIT));
          const values: NewInvoiceValues = {
            clientName: form.get('client_name') ?? '',
            description: form.get('description') ?? '',
            assetSymbol: form.get('asset') ?? '',
            amount: (form.get('amount') ?? '').trim(),
            dueDate: (form.get('due_date') ?? '').trim(),
          };
          const rerender = (error: string) =>
            send(ctx, 400, newInvoicePage(pageContext(ctx), registry.list(), values, error));

          const dueAt = endOfDay(values.dueDate, config.utcOffsetMinutes);
          if (dueAt === undefined) return rerender('Enter the due date as a valid date.');
          try {
            const invoice = createInvoice(
              {
                id: makeId(),
                reference: makeReference(),
                clientName: values.clientName,
                description: values.description,
                assetSymbol: values.assetSymbol,
                amount: values.amount,
                dueAt,
              },
              registry,
              ctx.now,
            );
            store.insert(invoice);
            redirect(ctx, `/admin/invoices/${invoice.id}`);
          } catch (error) {
            // Domain errors carry messages written for the owner; anything else is a real fault.
            if (
              error instanceof AmountError ||
              error instanceof InvoiceError ||
              error instanceof AssetError
            ) {
              return rerender(error.message.charAt(0).toUpperCase() + error.message.slice(1));
            }
            throw error;
          }
        },
        { write: true },
      ),
    },
    {
      method: 'GET',
      pattern: /^\/admin\/stats$/,
      handler: admin((ctx) =>
        send(ctx, 200, statsPage(pageContext(ctx), store.stats(ctx.now, config.utcOffsetMinutes))),
      ),
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/admin/invoices/${ID}$`),
      handler: admin((ctx, match) => {
        const invoice = store.get(match[1]!);
        if (!invoice) return notFound(ctx);
        send(ctx, 200, invoiceDetailPage(pageContext(ctx), invoice, payUrlFor(invoice.id)));
      }),
    },

    // ---- Public payment page ---------------------------------------------------------------

    {
      method: 'GET',
      pattern: new RegExp(`^/pay/${ID}$`),
      handler: (ctx, match) => {
        const invoice = store.get(match[1]!);
        if (!invoice) return notFound(ctx);
        const paymentUrl = buildPaymentUrl({
          recipient: config.recipient,
          amount: invoice.amount,
          decimals: invoice.asset.decimals,
          mint: invoice.asset.mint,
          reference: invoice.reference,
          ...(config.ownerName ? { label: config.ownerName } : {}),
          message: invoice.description.slice(0, 100),
        });
        send(
          ctx,
          200,
          payPage(pageContext(ctx), {
            invoice,
            ownerName: config.ownerName,
            recipient: config.recipient,
            paymentUrl,
            qrSvg: qrSvg(paymentUrl),
            statusUrl: `/api/pay/${invoice.id}/status`,
          }),
        );
      },
    },
    {
      // Public like the payment page: whoever has the invoice link can download its receipt.
      method: 'GET',
      pattern: new RegExp(`^/pay/${ID}/receipt\\.pdf$`),
      handler: (ctx, match) => {
        const invoice = store.get(match[1]!);
        // A receipt documents a payment, so an unpaid invoice has none.
        if (!invoice || invoice.status !== 'paid') return notFound(ctx);
        const pdf = buildReceiptPdf({
          invoice,
          ownerName: config.ownerName,
          recipient: config.recipient,
          cluster: config.cluster,
          utcOffsetMinutes: config.utcOffsetMinutes,
          generatedAt: ctx.now,
        });
        send(ctx, 200, pdf, 'application/pdf', {
          'Content-Disposition': `inline; filename="receipt-${invoice.id}.pdf"`,
        });
      },
    },
    {
      method: 'GET',
      pattern: new RegExp(`^/api/pay/${ID}/status$`),
      handler: (ctx, match) => {
        const invoice = store.get(match[1]!);
        if (!invoice)
          return send(ctx, 404, JSON.stringify({ error: 'not_found' }), 'application/json');
        const body: Record<string, unknown> = {
          status: invoice.status,
          paid: invoice.status === 'paid',
          overdue: isOverdue(invoice, ctx.now),
        };
        if (invoice.payment) {
          body['signature'] = invoice.payment.signature;
          body['explorerUrl'] = explorerTxUrl(invoice.payment.signature, config.cluster);
        }
        send(ctx, 200, JSON.stringify(body), 'application/json');
      },
    },
  ];

  const clientIp = (request: IncomingMessage): string => {
    if (config.trustProxy) {
      const forwarded = request.headers['x-forwarded-for'];
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
      if (first) return first;
    }
    return request.socket.remoteAddress ?? 'unknown';
  };

  return createServer((request, response) => {
    void (async () => {
      const ctx: Context = {
        request,
        response,
        path: '/',
        ip: clientIp(request),
        now: clock(),
      };
      try {
        const url = new URL(request.url ?? '/', config.baseUrl);
        ctx.path = url.pathname;
        const method = request.method === 'HEAD' ? 'GET' : request.method;

        // Public pages are open to anyone, so they get a per-client limit.
        if (ctx.path.startsWith('/pay/') || ctx.path.startsWith('/api/pay/')) {
          const attempt = publicLimiter.take(ctx.ip);
          if (!attempt.allowed) {
            return send(
              ctx,
              429,
              messagePage(
                config.cluster,
                'Too many requests',
                'Please slow down and try again shortly.',
              ),
              'text/html; charset=utf-8',
              { 'Retry-After': String(attempt.retryAfterSeconds) },
            );
          }
        }

        let pathMatched = false;
        for (const route of routes) {
          const match = route.pattern.exec(ctx.path);
          if (!match) continue;
          pathMatched = true;
          if (route.method !== method) continue;
          await route.handler(ctx, match);
          return;
        }
        if (pathMatched) {
          return send(
            ctx,
            405,
            messagePage(
              config.cluster,
              'Method not allowed',
              'This page does not accept that request.',
            ),
          );
        }
        notFound(ctx);
      } catch (error) {
        if (response.headersSent) {
          response.end();
          return;
        }
        if (error instanceof BodyTooLargeError) {
          return send(
            ctx,
            413,
            messagePage(config.cluster, 'Too large', 'The request is too large.'),
          );
        }
        deps.onError?.(error);
        send(
          ctx,
          500,
          messagePage(config.cluster, 'Something went wrong', 'Please try again later.'),
        );
      }
    })();
  });
}
