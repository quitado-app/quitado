import { request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mainnetRegistry, recordPayment } from '@quitado/core';
import { createInvoiceStore, openDatabase, type InvoiceStore } from '../storage/index.ts';
import { createWebServer, type AppConfig } from './app.ts';
import { createAuth, createRateLimiter } from './auth.ts';

const SECRET = 'a-long-enough-secret-value-1234';
const BASE = 'http://localhost:3000';
const RECIPIENT = 'E2pDM8RRwhiPhJVzpF1sN8JzvUDmPP6eG7M4xH8FbQxL';
const NOW = Date.UTC(2026, 10, 2, 15, 0, 0);

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  /** The raw bytes, for binary responses such as PDFs. */
  buffer: Buffer;
}

describe('web app', () => {
  let server: Server;
  let port: number;
  let store: InvoiceStore;
  let now: number;
  let errors: unknown[];

  const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
    baseUrl: BASE,
    recipient: RECIPIENT,
    cluster: 'mainnet-beta',
    ownerName: 'Davi Freelancer',
    utcOffsetMinutes: -180,
    trustProxy: false,
    ...overrides,
  });

  async function start(options: { config?: Partial<AppConfig>; publicMax?: number } = {}) {
    store = createInvoiceStore(openDatabase(':memory:'));
    server = createWebServer({
      config: config(options.config),
      store,
      registry: mainnetRegistry(),
      auth: createAuth(SECRET),
      now: () => now,
      onError: (error) => errors.push(error),
      ...(options.publicMax === undefined
        ? {}
        : { publicLimiter: createRateLimiter({ max: options.publicMax, windowMs: 60_000 }) }),
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  }

  beforeEach(() => {
    now = NOW;
    errors = [];
  });
  afterEach(() => new Promise<void>((resolve) => server.close(() => resolve())));

  function call(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: string } = {},
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port, path, method: init.method ?? 'GET', headers: init.headers },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () =>
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers,
              body: Buffer.concat(chunks).toString('utf8'),
              buffer: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on('error', reject);
      if (init.body !== undefined) req.write(init.body);
      req.end();
    });
  }

  const form = (
    path: string,
    fields: Record<string, string>,
    headers: Record<string, string> = {},
  ) =>
    call(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', origin: BASE, ...headers },
      body: new URLSearchParams(fields).toString(),
    });

  async function login(): Promise<string> {
    const response = await form('/admin/login', { secret: SECRET });
    expect(response.status).toBe(303);
    const cookie = [response.headers['set-cookie'] ?? []].flat()[0]!;
    return cookie.split(';')[0]!;
  }

  const invoiceFields = (overrides: Record<string, string> = {}) => ({
    client_name: 'Acme Inc',
    description: 'Website redesign, October',
    asset: 'USDC',
    amount: '1250.50',
    due_date: '2026-11-20',
    ...overrides,
  });

  async function createInvoiceViaForm(cookie: string, overrides: Record<string, string> = {}) {
    const response = await form('/admin/invoices', invoiceFields(overrides), { cookie });
    expect(response.status).toBe(303);
    return String(response.headers.location).replace('/admin/invoices/', '');
  }

  describe('basics and security headers', () => {
    beforeEach(() => start());

    it('does not let slow clients hold connections open for minutes', () => {
      expect(server.headersTimeout).toBe(15_000);
      expect(server.requestTimeout).toBe(30_000);
    });

    it('answers the health check and redirects the root', async () => {
      expect(JSON.parse((await call('/healthz')).body)).toEqual({ ok: true });
      const root = await call('/');
      expect(root.status).toBe(303);
      expect(root.headers.location).toBe('/admin');
    });

    it('sends strict security headers on every kind of response', async () => {
      for (const path of [
        '/healthz',
        '/admin/login',
        '/nope',
        '/static/app.css',
        '/pay/abcdefghijklmnopqrstuv',
      ]) {
        const { headers } = await call(path);
        expect(headers['content-security-policy']).toContain("default-src 'none'");
        expect(headers['content-security-policy']).toContain("script-src 'self'");
        expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
        expect(headers['x-content-type-options']).toBe('nosniff');
        // 'no-referrer' would make browsers send "Origin: null" on same-site form posts and break the
        // CSRF origin check (found by running the app in a real browser).
        expect(headers['referrer-policy']).toBe('same-origin');
        expect(headers['x-frame-options']).toBe('DENY');
        expect(headers['strict-transport-security']).toBeUndefined(); // http instance
      }
    });

    it('serves css and js that need no inline code', async () => {
      const css = await call('/static/app.css');
      expect(css.headers['content-type']).toContain('text/css');
      const js = await call('/static/app.js');
      expect(js.headers['content-type']).toContain('text/javascript');
      expect(js.body).not.toMatch(/innerHTML|eval\(|document\.write/);
    });

    it('returns 404, 405 and works for HEAD', async () => {
      expect((await call('/nope')).status).toBe(404);
      expect((await call('/healthz', { method: 'POST' })).status).toBe(405);
      const head = await call('/healthz', { method: 'HEAD' });
      expect(head.status).toBe(200);
      expect(head.body).toBe('');
    });

    it('refuses an oversized form body', async () => {
      const cookie = await login();
      const response = await form(
        '/admin/invoices',
        { ...invoiceFields(), description: 'x'.repeat(40_000) },
        { cookie },
      );
      expect(response.status).toBe(413);
    });
  });

  describe('home page on the site host', () => {
    const SITE = 'quitado.example';
    const onSite = (headers: Record<string, string> = {}) => ({
      headers: { host: SITE, ...headers },
    });
    beforeEach(() => start({ config: { siteHost: SITE, baseUrl: 'https://pay.example.com' } }));

    it('shows the project page at the root of the site host, in English by default', async () => {
      const page = await call('/', onSite());
      expect(page.status).toBe(200);
      expect(page.headers['content-type']).toContain('text/html');
      expect(page.headers.vary).toBe('Accept-Language');
      expect(page.body).toContain('<html lang="en">');
      expect(page.body).toContain('<h1 id="hero-title">Bill in USDC or USDT.');
      expect(page.body).toContain('Quitado never holds your money or your keys');
      expect(page.body).toContain('charges no fee');
      expect(page.body).toContain('Apache-2.0');
      // Search engines may index it, and it points at its own address.
      expect(page.body).toContain('content="index, follow"');
      expect(page.body).toContain('<link rel="canonical" href="https://quitado.example/?lang=en"');
    });

    it('follows ?lang= first, then the browser language', async () => {
      const byBrowser = await call('/', onSite({ 'accept-language': 'pt-BR,pt;q=0.9' }));
      expect(byBrowser.body).toContain('<html lang="pt-BR">');
      expect(byBrowser.body).toContain('Cobre em USDC ou USDT.');
      const byQuery = await call('/?lang=en', onSite({ 'accept-language': 'pt-BR' }));
      expect(byQuery.body).toContain('<html lang="en">');
      expect(byQuery.body).toContain('aria-current="true"');
    });

    it('says the same things in both languages, and says what is not built', async () => {
      const [en, pt] = await Promise.all([
        call('/?lang=en', onSite()),
        call('/?lang=pt-BR', onSite()),
      ]);
      for (const tag of ['<li', '<details', '<h2', '<h3', '<dt', 'href="https://']) {
        expect(en.body.split(tag).length, tag).toBe(pt.body.split(tag).length);
      }
      expect(en.body).toContain('planned and do not exist yet');
      // Both languages offer the one-click Railway deploy.
      for (const page of [en, pt]) {
        expect(page.body).toContain('href="https://railway.com/deploy/quitado"');
      }
      expect(pt.body).toContain('estão planejados e ainda não existem');
      expect(pt.body).toContain('Ele não é nota fiscal'); // the receipt is not a tax document
      // No customers, numbers or testimonials exist, so none may appear.
      expect(en.body).not.toMatch(/testimonial|trusted by|customers? (love|trust)/i);
    });

    it('labels the example invoice as an example and dates it from the clock', async () => {
      const en = await call('/?lang=en', onSite());
      expect(en.body).toContain('Illustrative example, not a real charge');
      expect(en.body).toContain('1,250.00 USDC');
      expect(en.body).toContain('2026-11-16'); // two weeks after NOW, in UTC-3
      const pt = await call('/?lang=pt-BR', onSite());
      expect(pt.body).toContain('Exemplo ilustrativo, não é uma cobrança real');
      expect(pt.body).toContain('1.250,00 USDC');
      expect(pt.body).toContain('16/11/2026');
    });

    it('works under the strict content policy: no inline script, no inline style, no outside files', async () => {
      const { body, headers } = await call('/', onSite());
      expect(headers['content-security-policy']).toContain("style-src 'self'");
      expect(body).not.toMatch(/<script(?![^>]*\bsrc=)/);
      expect(body).not.toMatch(/\sstyle=/);
      expect(body).not.toMatch(/<style\b/);
      expect(body).not.toMatch(/(?:src|href)="\/\//);
      expect(body).toContain('href="/static/landing.css"');
    });

    it('serves its stylesheet, and the stylesheet needs no outside resources', async () => {
      const css = await call('/static/landing.css', onSite());
      expect(css.status).toBe(200);
      expect(css.headers['content-type']).toContain('text/css');
      expect(css.body).not.toMatch(/url\(|@import|https?:\/\//);
    });

    it('sends everything else on the site host to the instance address', async () => {
      const admin = await call('/admin', onSite());
      expect(admin.status).toBe(303);
      expect(admin.headers.location).toBe('https://pay.example.com/admin');
      const pay = await call('/pay/abcdefghijklmnopqrstuv?lang=pt-BR', onSite());
      expect(pay.headers.location).toBe(
        'https://pay.example.com/pay/abcdefghijklmnopqrstuv?lang=pt-BR',
      );
      expect((await call('/healthz', onSite())).status).toBe(200);
    });

    it('leaves the instance address alone: its root still goes to the sign-in', async () => {
      const root = await call('/', { headers: { host: 'pay.example.com' } });
      expect(root.status).toBe(303);
      expect(root.headers.location).toBe('/admin');
      // Nor does a port in the Host header change which site is meant.
      const withPort = await call('/', onSite({ host: `${SITE}:443` }));
      expect(withPort.status).toBe(200);
    });

    it('allows search engines on the site host only', async () => {
      expect((await call('/robots.txt', onSite())).body).toContain('Allow: /');
      expect((await call('/robots.txt', { headers: { host: 'pay.example.com' } })).body).toContain(
        'Disallow: /',
      );
    });
  });

  describe('home page when no site host is set', () => {
    beforeEach(() => start());

    it('keeps the root redirect for every host name', async () => {
      const root = await call('/', { headers: { host: 'quitado.finance' } });
      expect(root.status).toBe(303);
      expect(root.headers.location).toBe('/admin');
    });
  });

  describe('sign in', () => {
    beforeEach(() => start());

    it('redirects anonymous visitors to the login page', async () => {
      for (const path of [
        '/admin',
        '/admin/invoices/new',
        '/admin/invoices/abcdefghijklmnopqrstuv',
      ]) {
        const response = await call(path);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe('/admin/login');
      }
    });

    it('rejects a wrong secret with one generic message and no cookie', async () => {
      const response = await form('/admin/login', { secret: 'wrong' });
      expect(response.status).toBe(401);
      expect(response.body).toContain('Incorrect access secret.');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('signs in with the right secret and sets a locked-down cookie', async () => {
      const response = await form('/admin/login', { secret: SECRET });
      expect(response.status).toBe(303);
      const cookie = [response.headers['set-cookie'] ?? []].flat()[0]!;
      expect(cookie).toMatch(/^quitado_session=v1\./);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Secure'); // plain-http dev instance
      const dashboard = await call('/admin', { headers: { cookie: cookie.split(';')[0]! } });
      expect(dashboard.status).toBe(200);
    });

    it('refuses cross-site and origin-less login attempts', async () => {
      const crossSite = await form(
        '/admin/login',
        { secret: SECRET },
        { origin: 'https://evil.example' },
      );
      expect(crossSite.status).toBe(403);
      expect(crossSite.headers['set-cookie']).toBeUndefined();
      const noOrigin = await call('/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `secret=${SECRET}`,
      });
      expect(noOrigin.status).toBe(403);
    });

    it('rate limits repeated attempts', async () => {
      for (let i = 0; i < 10; i++)
        expect((await form('/admin/login', { secret: 'wrong' })).status).toBe(401);
      const blocked = await form('/admin/login', { secret: SECRET });
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('rejects an expired or forged session', async () => {
      const cookie = await login();
      expect((await call('/admin', { headers: { cookie } })).status).toBe(200);
      now += 13 * 3_600_000;
      expect((await call('/admin', { headers: { cookie } })).status).toBe(303);
      expect(
        (await call('/admin', { headers: { cookie: 'quitado_session=v1.1.x.y' } })).status,
      ).toBe(303);
    });

    it('signs out', async () => {
      const cookie = await login();
      const out = await form('/admin/logout', {}, { cookie });
      expect(out.status).toBe(303);
      expect([out.headers['set-cookie'] ?? []].flat()[0]).toContain('Max-Age=0');
      expect((await form('/admin/logout', {}, { origin: 'https://evil.example' })).status).toBe(
        403,
      );
    });
  });

  describe('invoices', () => {
    beforeEach(() => start());

    it('creates an invoice and shows its payment link', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);

      const stored = store.get(id)!;
      expect(stored).toMatchObject({
        clientName: 'Acme Inc',
        amount: 1_250_500_000n,
        status: 'open',
        asset: { symbol: 'USDC' },
      });
      // 23:59:59 on 20 Nov in Brasilia (UTC-3)
      expect(stored.dueAt).toBe(Date.UTC(2026, 10, 21, 2, 59, 59));

      const detail = await call(`/admin/invoices/${id}`, { headers: { cookie } });
      expect(detail.status).toBe(200);
      expect(detail.body).toContain(`${BASE}/pay/${id}`);
      expect(detail.body).toContain('1,250.50 USDC');
      expect(detail.body).toContain('2026-11-20');
    });

    it('refreshes the owner page by itself until the invoice is paid', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      const open = await call(`/admin/invoices/${id}`, { headers: { cookie } });
      expect(open.body).toContain(`id="pay-root" data-status-url="/api/pay/${id}/status"`);
      expect(open.body).toContain('This page updates by itself');

      const invoice = store.get(id)!;
      store.settle(
        recordPayment(invoice, {
          signature: 'sig123',
          amount: invoice.amount,
          receivedAt: NOW + 1000,
        }),
      );
      const paid = await call(`/admin/invoices/${id}`, { headers: { cookie } });
      expect(paid.body).toContain('Payment received');
      expect(paid.body).not.toContain('data-status-url');
      expect(paid.body).not.toContain('This page updates by itself');
    });

    it('lists invoices on the dashboard', async () => {
      const cookie = await login();
      await createInvoiceViaForm(cookie, { client_name: 'First client' });
      await createInvoiceViaForm(cookie, { client_name: 'Second client' });
      const dashboard = await call('/admin', { headers: { cookie } });
      expect(dashboard.body).toContain('First client');
      expect(dashboard.body).toContain('Second client');
      expect(dashboard.body).toContain('2 shown, 2 open');
    });

    it('shows the empty state', async () => {
      const cookie = await login();
      expect((await call('/admin', { headers: { cookie } })).body).toContain('No invoices yet');
    });

    it.each([
      ['an amount with too many decimals', { amount: '1.2345678' }, /too many decimal places/i],
      ['a negative amount', { amount: '-5' }, /invalid amount/i],
      ['a zero amount', { amount: '0' }, /greater than zero/i],
      ['an unsupported token', { asset: 'DAI' }, /unsupported asset/i],
      ['an empty client', { client_name: '   ' }, /client name is required/i],
      ['a past due date', { due_date: '2026-11-01' }, /future/i],
      ['an impossible date', { due_date: '2026-02-30' }, /valid date/i],
      ['a malformed date', { due_date: 'next week' }, /valid date/i],
    ])('rejects %s and creates nothing', async (_name, overrides, message) => {
      const cookie = await login();
      const response = await form('/admin/invoices', invoiceFields(overrides), { cookie });
      expect(response.status).toBe(400);
      expect(response.body).toMatch(message);
      expect(store.list()).toEqual([]);
    });

    it('keeps what the owner typed when it re-shows the form with an error', async () => {
      const cookie = await login();
      const response = await form(
        '/admin/invoices',
        invoiceFields({
          amount: 'abc',
          client_name: 'Keep "me" <b>',
          description: '  spaced  text  ',
        }),
        { cookie },
      );
      expect(response.body).toContain('value="Keep &quot;me&quot; &lt;b&gt;"');
      expect(response.body).toContain('  spaced  text  </textarea>');
    });

    it('requires sign-in and same-origin to create', async () => {
      const anonymous = await form('/admin/invoices', invoiceFields());
      expect(anonymous.status).toBe(303);
      expect(anonymous.headers.location).toBe('/admin/login');
      const cookie = await login();
      const crossSite = await form('/admin/invoices', invoiceFields(), {
        cookie,
        origin: 'https://evil.example',
      });
      expect(crossSite.status).toBe(403);
      expect(store.list()).toEqual([]);
    });

    it('returns 404 for an unknown invoice', async () => {
      const cookie = await login();
      expect(
        (await call('/admin/invoices/abcdefghijklmnopqrstuv', { headers: { cookie } })).status,
      ).toBe(404);
    });
  });

  describe('public payment page', () => {
    let id: string;
    beforeEach(async () => {
      await start();
      id = await createInvoiceViaForm(await login());
    });

    it('shows the invoice, a QR code and a Solana Pay link, with no sign-in', async () => {
      const page = await call(`/pay/${id}`);
      expect(page.status).toBe(200);
      expect(page.body).toContain('1,250.50 USDC');
      expect(page.body).toContain('Acme Inc');
      expect(page.body).toContain('Davi Freelancer');
      expect(page.body).toContain('Website redesign, October');
      expect(page.body).toContain('<svg');
      expect(page.body).toContain('Open in wallet');
      expect(page.body).toContain('Pay with a Solana wallet');
      expect(page.body).toContain(`data-status-url="/api/pay/${id}/status"`);

      const reference = store.get(id)!.reference;
      // The attribute is HTML-escaped (&amp;); a browser decodes it before opening the link.
      const link = /href="(solana:[^"]+)"/.exec(page.body)![1]!.replaceAll('&amp;', '&');
      expect(link).toContain(
        `solana:${RECIPIENT}?amount=1250.5&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`,
      );
      expect(link).toContain(`reference=${reference}`);
    });

    it('says that a payment typed in by hand is not recognised, and how to open the wallet', async () => {
      // The source wraps long sentences, so compare with whitespace collapsed.
      const text = (await call(`/pay/${id}`)).body.replace(/\s+/g, ' ');
      expect(text).toContain('Recipient address');
      expect(text).toContain('typed in by hand');
      expect(text).toContain('does not mark this invoice as paid');
      expect(text).toContain('If your wallet says the address is not valid');
      expect(text).not.toContain('Pay to');
    });

    describe('language', () => {
      const portuguese = { 'accept-language': 'pt-BR,pt;q=0.9,en;q=0.8' };
      const collapse = (text: string) => text.replace(/\s+/g, ' ');

      it('is English when the browser says nothing', async () => {
        const page = await call(`/pay/${id}`);
        expect(page.body).toContain('<html lang="en">');
        expect(page.body).toContain('Open in wallet');
        expect(page.body).toContain('1,250.50 USDC');
        expect(page.body).toContain('2026-11-20');
        expect(page.headers.vary).toContain('Accept-Language');
      });

      it('follows the browser language, with Brazilian number and date formats', async () => {
        const page = await call(`/pay/${id}`, { headers: portuguese });
        expect(page.body).toContain('<html lang="pt-BR">');
        expect(page.body).toContain('Abrir na carteira');
        expect(page.body).toContain('Fatura de Davi Freelancer');
        expect(page.body).toContain('1.250,50 USDC');
        expect(page.body).toContain('20/11/2026');
        expect(page.body).toContain('Em aberto');
        expect(page.body).not.toContain('Open in wallet');
      });

      it('lets ?lang= win over the browser, and ignores a language it does not have', async () => {
        const english = await call(`/pay/${id}?lang=en`, { headers: portuguese });
        expect(english.body).toContain('Open in wallet');
        expect(english.body).not.toContain('Abrir na carteira');
        expect((await call(`/pay/${id}?lang=pt`)).body).toContain('Abrir na carteira');
        expect((await call(`/pay/${id}?lang=fr`)).body).toContain('Open in wallet');
        expect((await call(`/pay/${id}?lang=fr`, { headers: portuguese })).body).toContain(
          'Abrir na carteira',
        );
      });

      it('offers a switch that marks the current language', async () => {
        const english = collapse((await call(`/pay/${id}`)).body);
        expect(english).toContain('href="?lang=pt-BR"');
        expect(english).toMatch(/aria-current="true" >English/);
        expect(english).not.toMatch(/aria-current="true" >Português/);
        const portugueseBody = collapse((await call(`/pay/${id}`, { headers: portuguese })).body);
        expect(portugueseBody).toMatch(/aria-current="true" >Português/);
        expect(portugueseBody).toContain('aria-label="Idioma"');
      });

      it('translates the overdue explanation, the waiting line and the copy confirmation', async () => {
        now = Date.UTC(2026, 11, 1);
        const english = collapse((await call(`/pay/${id}`)).body);
        expect(english).toContain('This invoice was due on 2026-11-20. You can still pay it.');
        const page = collapse((await call(`/pay/${id}`, { headers: portuguese })).body);
        expect(page).toContain('Esta fatura venceu em 20/11/2026. Você ainda pode pagá-la.');
        expect(page).toContain('Vencida');
        expect(page).toContain('data-copied="Copiado"');
        expect(page).toContain('role="status" aria-live="polite"');
        expect(page).toContain('Aguardando o seu pagamento');
        expect(page).toContain('data-paid-text="Pagamento recebido. Atualizando a página…"');
      });

      it('puts the button before the QR code, which is open when there is no JavaScript', async () => {
        const body = (await call(`/pay/${id}`)).body;
        expect(body.indexOf('Open in wallet')).toBeLessThan(body.indexOf('<svg'));
        expect(body).toMatch(/id="qr-details"\s+open/);
      });

      it('shows what a payer can check on the paid page, in either language', async () => {
        const invoice = store.get(id)!;
        store.settle(
          recordPayment(invoice, {
            signature: 'sig123',
            amount: invoice.amount,
            receivedAt: NOW + 1000,
          }),
        );
        const english = collapse((await call(`/pay/${id}`)).body);
        expect(english).toContain('Verify this payment');
        expect(english).toContain(RECIPIENT);
        expect(english).toContain('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
        expect(english).toContain('sig123');
        const page = collapse((await call(`/pay/${id}`, { headers: portuguese })).body);
        expect(page).toContain('Fatura paga');
        expect(page).toContain('Verificar este pagamento');
        expect(page).toContain('Pagamento recebido em 02/11/2026');
        expect(page).toContain('Baixar recibo (PDF)');
      });
    });

    it('does not expose owner pages or other invoices through it', async () => {
      const page = await call(`/pay/${id}`);
      expect(page.body).not.toContain('Sign out');
      expect(page.body).not.toContain('/admin');
    });

    it('escapes everything the owner typed, so a client name cannot inject markup', async () => {
      const cookie = await login();
      const evil = '<script>alert(1)</script><img src=x onerror=alert(2)>';
      const evilId = await createInvoiceViaForm(cookie, { client_name: evil, description: evil });
      for (const [path, headers] of [
        [`/pay/${evilId}`, {}],
        [`/admin/invoices/${evilId}`, { cookie }],
        ['/admin', { cookie }],
      ] as const) {
        const body = (await call(path, { headers })).body;
        expect(body).not.toContain('<script>alert');
        expect(body).not.toContain('<img src=x');
        expect(body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      }
    });

    it('returns the same 404 for an unknown id and for a malformed one', async () => {
      const unknown = await call('/pay/abcdefghijklmnopqrstuv');
      const malformed = await call('/pay/not-an-id');
      expect(unknown.status).toBe(404);
      expect(malformed.status).toBe(404);
      expect(unknown.body).toBe(malformed.body);
    });

    it('reports the status as JSON without leaking invoice details', async () => {
      const response = await call(`/api/pay/${id}/status`);
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(JSON.parse(response.body)).toEqual({ status: 'open', paid: false, overdue: false });
      expect((await call('/api/pay/abcdefghijklmnopqrstuv/status')).status).toBe(404);
    });

    it('marks an invoice overdue after its due date but keeps it payable', async () => {
      now = Date.UTC(2026, 11, 1);
      expect(JSON.parse((await call(`/api/pay/${id}/status`)).body).overdue).toBe(true);
      const page = await call(`/pay/${id}`);
      expect(page.body).toContain('Past due');
      expect(page.body).toContain('Open in wallet');
    });

    it('switches to the paid state, with a link to the transaction, once settled', async () => {
      const invoice = store.get(id)!;
      store.settle(
        recordPayment(invoice, {
          signature: 'sig123',
          amount: invoice.amount,
          receivedAt: NOW + 1000,
        }),
      );
      expect(JSON.parse((await call(`/api/pay/${id}/status`)).body)).toEqual({
        status: 'paid',
        paid: true,
        overdue: false,
        signature: 'sig123',
        explorerUrl: 'https://explorer.solana.com/tx/sig123',
      });
      const page = await call(`/pay/${id}`);
      expect(page.body).toContain('Invoice paid');
      expect(page.body).toContain('https://explorer.solana.com/tx/sig123');
      expect(page.body).not.toContain('Open in wallet');
      expect(page.body).not.toContain('data-status-url');
    });

    describe('receipt', () => {
      const settle = () => {
        const invoice = store.get(id)!;
        store.settle(
          recordPayment(invoice, {
            signature: 'sig123',
            amount: invoice.amount,
            receivedAt: NOW + 1000,
          }),
        );
      };

      it('does not exist until the invoice is paid', async () => {
        const response = await call(`/pay/${id}/receipt.pdf`);
        expect(response.status).toBe(404);
        // No link to a receipt on an unpaid page either.
        expect((await call(`/pay/${id}`)).body).not.toContain('receipt.pdf');
      });

      it('is served as a PDF to anyone with the invoice link once it is paid', async () => {
        settle();
        const response = await call(`/pay/${id}/receipt.pdf`);
        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
        expect(response.headers['content-disposition']).toBe(
          `inline; filename="receipt-${id}.pdf"`,
        );
        expect(response.headers['cache-control']).toBe('no-store');
        expect(response.headers['x-content-type-options']).toBe('nosniff');
        expect(response.buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
        expect(response.buffer.toString('latin1').endsWith('%%EOF\n')).toBe(true);
        expect(Number(response.headers['content-length'])).toBe(response.buffer.length);
      });

      it('is linked from the customer page, in its language, and from the owner page', async () => {
        settle();
        const link = (query = '') => `href="/pay/${id}/receipt.pdf${query}"`;
        expect((await call(`/pay/${id}`)).body).toContain(link('?lang=en'));
        expect((await call(`/pay/${id}?lang=pt-BR`)).body).toContain(link('?lang=pt-BR'));
        const cookie = await login();
        expect((await call(`/admin/invoices/${id}`, { headers: { cookie } })).body).toContain(
          link(),
        );
      });

      it('is written in the language asked for: ?lang=, else the browser, else English', async () => {
        settle();
        const title = async (path: string, headers: Record<string, string> = {}) => {
          const response = await call(path, { headers });
          expect(response.status).toBe(200);
          expect(response.headers.vary).toContain('Accept-Language');
          return /\/Title \(([^)]*)\)/.exec(response.buffer.toString('latin1'))![1];
        };
        const portuguese = { 'accept-language': 'pt-BR,pt;q=0.9' };
        expect(await title(`/pay/${id}/receipt.pdf`)).toBe(`Payment receipt ${id}`);
        expect(await title(`/pay/${id}/receipt.pdf?lang=pt-BR`)).toBe(`Recibo de pagamento ${id}`);
        expect(await title(`/pay/${id}/receipt.pdf`, portuguese)).toBe(`Recibo de pagamento ${id}`);
        expect(await title(`/pay/${id}/receipt.pdf?lang=en`, portuguese)).toBe(
          `Payment receipt ${id}`,
        );
      });

      it('answers 404 for unknown and malformed ids, and only to GET', async () => {
        settle();
        expect((await call('/pay/abcdefghijklmnopqrstuv/receipt.pdf')).status).toBe(404);
        expect((await call('/pay/not-an-id/receipt.pdf')).status).toBe(404);
        expect((await call(`/pay/${id}/receipt.pdf`, { method: 'POST' })).status).toBe(405);
      });
    });
  });

  describe('accessibility of the markup', () => {
    beforeEach(() => start());

    it('gives every page a main landmark, a skip link and a polite live region', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      for (const [path, headers] of [
        ['/admin/login', {}],
        ['/admin', { cookie }],
        ['/admin/invoices/new', { cookie }],
        [`/admin/invoices/${id}`, { cookie }],
        ['/admin/stats', { cookie }],
        [`/pay/${id}`, {}],
        ['/nope', {}],
      ] as const) {
        const { body } = await call(path, { headers });
        expect(body, path).toContain('<main id="main" tabindex="-1">');
        expect(body, path).toContain('<a class="skip" href="#main">');
        expect(body, path).toContain('id="live-status" role="status" aria-live="polite"');
        expect(body.split('<main').length, path).toBe(2);
        expect(body.split('<h1').length, path).toBe(2);
      }
    });

    it('marks the owner menu entry of the page being shown, once', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      const expectations = [
        ['/admin', '/admin'],
        ['/admin/invoices/new', '/admin/invoices/new'],
        ['/admin/stats', '/admin/stats'],
        [`/admin/invoices/${id}`, '/admin'],
      ] as const;
      for (const [path, entry] of expectations) {
        const { body } = await call(path, { headers: { cookie } });
        expect(body.split('aria-current="page"').length - 1, path).toBe(1);
        expect(body, path).toContain(`<a href="${entry}" aria-current="page">`);
      }
    });

    it('labels the owner menu in the page language', async () => {
      const cookie = await login();
      expect((await call('/admin', { headers: { cookie } })).body).toContain(
        '<nav aria-label="Owner menu">',
      );
      const pt = await call('/admin', { headers: { cookie, 'accept-language': 'pt-BR' } });
      expect(pt.body).toContain('<nav aria-label="Menu do dono">');
      expect(pt.body).toContain('>Ir para o conteúdo<');
    });
  });

  describe('owner pages in Portuguese', () => {
    beforeEach(() => start());
    const PT = { 'accept-language': 'pt-BR,pt;q=0.9' };

    it('follow ?lang=, then the browser language, and stay English otherwise', async () => {
      expect((await call('/admin/login')).body).toContain('<h1>Sign in</h1>');
      const byBrowser = await call('/admin/login', { headers: PT });
      expect(byBrowser.body).toContain('<html lang="pt-BR">');
      expect(byBrowser.body).toContain('<h1>Entrar</h1>');
      expect(byBrowser.body).toContain('Senha de acesso');
      const byQuery = await call('/admin/login?lang=en', { headers: PT });
      expect(byQuery.body).toContain('<h1>Sign in</h1>');
    });

    it('show a switch whose links point at a page that can be fetched', async () => {
      const { body } = await call('/admin/login');
      expect(body).toContain('href="/admin/login?lang=pt-BR"');
      expect(body).toContain('href="/admin/login?lang=en"');
      expect(body).toContain('aria-current="true"');
      const cookie = await login();
      const list = await call('/admin', { headers: { cookie } });
      expect(list.body).toContain('href="/admin?lang=pt-BR"');
    });

    it('say a wrong secret in Portuguese, and keep the language after signing in', async () => {
      const wrong = await form('/admin/login?lang=pt-BR', { secret: 'nope' });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toContain('Senha de acesso incorreta.');
      expect(wrong.body).toContain('action="/admin/login?lang=pt-BR"');
      const ok = await form('/admin/login?lang=pt-BR', { secret: SECRET });
      expect(ok.headers.location).toBe('/admin?lang=pt-BR');
      const plain = await form('/admin/login', { secret: SECRET });
      expect(plain.headers.location).toBe('/admin');
    });

    it('keep the language when sending anonymous visitors to the sign-in, and on sign out', async () => {
      const anonymous = await call('/admin?lang=pt-BR');
      expect(anonymous.headers.location).toBe('/admin/login?lang=pt-BR');
      const cookie = await login();
      const out = await form('/admin/logout?lang=pt-BR', {}, { cookie });
      expect(out.headers.location).toBe('/admin/login?lang=pt-BR');
    });

    it('show the invoice list in Portuguese, with Brazilian amounts and dates', async () => {
      const cookie = await login();
      await createInvoiceViaForm(cookie);
      const { body } = await call('/admin', { headers: { cookie, ...PT } });
      for (const text of [
        '<h1>Faturas</h1>',
        'Nova fatura',
        'Estatísticas',
        'Sair',
        '1 exibidas, 1 em aberto.',
        'Em aberto',
        '1.250,50 USDC',
        '20/11/2026',
        '>Ver<',
      ]) {
        expect(body).toContain(text);
      }
      expect(body).not.toContain('Sign out');
    });

    it('carry a chosen language through the owner menu and the invoice links', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      const { body } = await call('/admin?lang=pt-BR', { headers: { cookie } });
      expect(body).toContain('href="/admin/invoices/new?lang=pt-BR"');
      expect(body).toContain('href="/admin/stats?lang=pt-BR"');
      expect(body).toContain(`href="/admin/invoices/${id}?lang=pt-BR"`);
      expect(body).toContain('action="/admin/logout?lang=pt-BR"');
      // Without a chosen language the links stay plain: the browser language decides.
      const plain = await call('/admin', { headers: { cookie, ...PT } });
      expect(plain.body).toContain('href="/admin/stats"');
    });

    it('lay the list out as blocks on a phone: every cell names itself', async () => {
      const cookie = await login();
      await createInvoiceViaForm(cookie);
      const { body } = await call('/admin', { headers: { cookie, ...PT } });
      expect(body).toContain('<table class="stack" role="table">');
      expect(body).toContain('role="columnheader"');
      for (const label of ['Cliente', 'Descrição', 'Valor', 'Vencimento', 'Situação']) {
        expect(body).toContain(`data-label="${label}"`);
      }
      const css = await call('/static/app.css');
      expect(css.body).toContain('table.stack');
    });

    it('translate the new invoice form and its validation errors', async () => {
      const cookie = await login();
      const page = await call('/admin/invoices/new', { headers: { cookie, ...PT } });
      expect(page.body).toContain('<h1>Nova fatura</h1>');
      expect(page.body).toContain('Criar fatura');
      for (const [fields, message] of [
        [{ amount: 'abc' }, 'Valor inválido.'],
        [{ amount: '1.1234567' }, 'Casas decimais demais: o máximo permitido é 6.'],
        [{ amount: '0' }, 'O valor deve ser maior que zero.'],
        [{ client_name: '  ' }, 'Informe o nome do cliente.'],
        [{ description: '' }, 'Informe a descrição.'],
        [{ due_date: '2026-11-01' }, 'O vencimento deve ser uma data futura.'],
        [{ due_date: 'ontem' }, 'Informe o vencimento como uma data válida.'],
      ] as const) {
        const response = await form('/admin/invoices?lang=pt-BR', invoiceFields(fields), {
          cookie,
        });
        expect(response.status, message).toBe(400);
        expect(response.body, message).toContain(message);
        // The page that shows the error can still switch language.
        expect(response.body).toContain('href="/admin/invoices/new?lang=en"');
      }
      // The same mistakes stay in English as the core wrote them.
      const english = await form('/admin/invoices', invoiceFields({ amount: 'abc' }), { cookie });
      expect(english.body).toContain('Invalid amount');
    });

    it('keep the language after creating an invoice, and show it in Portuguese', async () => {
      const cookie = await login();
      const created = await form('/admin/invoices?lang=pt-BR', invoiceFields(), { cookie });
      expect(created.status).toBe(303);
      const location = String(created.headers.location);
      expect(location).toMatch(/^\/admin\/invoices\/[\w-]{22}\?lang=pt-BR$/);
      const detail = await call(location, { headers: { cookie } });
      for (const text of [
        'Fatura para Acme Inc',
        '1.250,50 USDC',
        'Link de pagamento',
        'Esta página se atualiza sozinha',
        'Criada em',
        'Vencimento',
        'data-copied="Copiado"',
      ]) {
        expect(detail.body).toContain(text);
      }
    });

    it('show a paid invoice in Portuguese, with a receipt link in the same language', async () => {
      const cookie = await login();
      const id = await createInvoiceViaForm(cookie);
      const invoice = store.get(id)!;
      store.settle(
        recordPayment(invoice, {
          signature: 'sig-pt-owner',
          amount: invoice.amount,
          receivedAt: now,
        }),
      );
      const { body } = await call(`/admin/invoices/${id}?lang=pt-BR`, { headers: { cookie } });
      expect(body).toContain('Pagamento recebido');
      expect(body).toContain('Valor recebido');
      expect(body).toContain('Ver a transação no explorador');
      expect(body).toContain(`href="/pay/${id}/receipt.pdf?lang=pt-BR"`);
      expect(body).toContain('Baixar recibo (PDF)');
    });

    it('translate the stats page', async () => {
      const cookie = await login();
      const empty = await call('/admin/stats', { headers: { cookie, ...PT } });
      expect(empty.body).toContain('<h1>Estatísticas</h1>');
      expect(empty.body).toContain('Faturas emitidas');
      expect(empty.body).toContain('Ainda não há faturas, então não há nada para somar.');
      const id = await createInvoiceViaForm(cookie, { amount: '100' });
      const invoice = store.get(id)!;
      store.settle(
        recordPayment(invoice, {
          signature: 'sig-pt-stats',
          amount: invoice.amount,
          receivedAt: now,
        }),
      );
      const full = await call('/admin/stats', { headers: { cookie, ...PT } });
      for (const text of ['Por token', 'Pagamentos por mês', 'Faturado', 'Recebido', '100,00']) {
        expect(full.body).toContain(text);
      }
      expect(full.body).toContain('class="card table-scroll"');
    });

    it('translate the notice pages', async () => {
      const cookie = await login();
      const missing = await call(`/admin/invoices/${'a'.repeat(22)}`, {
        headers: { cookie, ...PT },
      });
      expect(missing.status).toBe(404);
      expect(missing.body).toContain('Não encontrado');
      expect(missing.body).toContain('Esta página não existe.');
      const crossSite = await call('/admin/invoices', {
        method: 'POST',
        headers: {
          ...PT,
          origin: 'https://evil.example',
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'a=b',
      });
      expect(crossSite.status).toBe(403);
      expect(crossSite.body).toContain('Acesso negado');
      const method = await call('/healthz', { method: 'POST', headers: PT });
      expect(method.status).toBe(405);
      expect(method.body).toContain('Método não permitido');
      expect((await call('/nope')).body).toContain('This page does not exist.');
    });
  });

  describe('stats page', () => {
    beforeEach(() => start());

    it('needs a sign-in, like the rest of the owner area', async () => {
      const response = await call('/admin/stats');
      expect(response.status).toBe(303);
      expect(response.headers.location).toBe('/admin/login');
    });

    it('is linked from the owner menu', async () => {
      const cookie = await login();
      expect((await call('/admin', { headers: { cookie } })).body).toContain('href="/admin/stats"');
    });

    it('says so when there is nothing to total yet', async () => {
      const cookie = await login();
      const response = await call('/admin/stats', { headers: { cookie } });
      expect(response.status).toBe(200);
      expect(response.body).toContain('Invoices issued');
      expect(response.body).toContain('No invoices yet, so there is nothing to total.');
    });

    it('shows counts, totals per token and payments per month', async () => {
      const cookie = await login();
      const paidId = await createInvoiceViaForm(cookie, { amount: '100' });
      await createInvoiceViaForm(cookie, { amount: '50' });
      const invoice = store.get(paidId)!;
      store.settle(
        recordPayment(invoice, {
          signature: 'sig-stats',
          amount: invoice.amount + 2_500_000n, // paid 2.50 over
          receivedAt: NOW,
        }),
      );

      const body = (await call('/admin/stats', { headers: { cookie } })).body;
      expect(body).toContain('2026-11'); // month of NOW, in the instance offset
      expect(body).toContain('150.00'); // invoiced
      expect(body).toContain('102.50'); // received, including the overpayment
      expect(body).toContain('1 (50%)'); // paid share
      expect(body).toContain('USDC');
      expect(body).toContain('Nothing is sent anywhere');
    });

    it('loads nothing from other sites', async () => {
      const cookie = await login();
      const body = (await call('/admin/stats', { headers: { cookie } })).body;
      expect(body).not.toMatch(/(?:src|href)="https?:\/\//);
    });
  });

  it('rate limits the public pages per client', async () => {
    await start({ publicMax: 3 });
    for (let i = 0; i < 3; i++)
      expect((await call('/pay/abcdefghijklmnopqrstuv')).status).toBe(404);
    const blocked = await call('/pay/abcdefghijklmnopqrstuv');
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after']).toBeDefined();
    // The owner area and the health check are not affected by the public limiter.
    expect((await call('/healthz')).status).toBe(200);
  });

  it('marks the instance as a test network on devnet', async () => {
    await start({ config: { cluster: 'devnet' } });
    expect((await call('/admin/login')).body).toContain('Test network (devnet)');
  });

  it('tells the customer which network to pay on, in plain words on mainnet and devnet', async () => {
    await start();
    const mainnetId = await createInvoiceViaForm(await login());
    const mainnet = (await call(`/pay/${mainnetId}`)).body;
    expect(mainnet).toContain('on the Solana network.');
    expect(mainnet).not.toMatch(/network\)? network/);
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await start({ config: { cluster: 'devnet' } });
    const devnetId = await createInvoiceViaForm(await login());
    const devnet = (await call(`/pay/${devnetId}`)).body;
    expect(devnet).toContain('on the Solana devnet test network.');
    expect(devnet).not.toMatch(/network\)? network/);
  });

  it('names who is asking for the money: the owner, or else the host the page is served from', async () => {
    await start({ config: { ownerName: undefined } });
    const id = await createInvoiceViaForm(await login());
    const page = (await call(`/pay/${id}`)).body;
    expect(page).toContain('Invoice from localhost:3000');
    expect(page).not.toContain('Davi Freelancer');
  });

  it('uses a __Host- Secure cookie and HSTS when served over https', async () => {
    await start({ config: { baseUrl: 'https://pay.example.com' } });
    const response = await form(
      '/admin/login',
      { secret: SECRET },
      { origin: 'https://pay.example.com' },
    );
    const cookie = [response.headers['set-cookie'] ?? []].flat()[0]!;
    expect(cookie).toMatch(/^__Host-quitado_session=/);
    expect(cookie).toContain('Secure');
    expect(response.headers['strict-transport-security']).toContain('max-age=');
  });

  it('only trusts X-Forwarded-For when configured to', async () => {
    await start({ publicMax: 1 });
    const spoof = (n: number) =>
      call('/pay/abcdefghijklmnopqrstuv', { headers: { 'x-forwarded-for': `10.0.0.${n}` } });
    expect((await spoof(1)).status).toBe(404);
    expect((await spoof(2)).status).toBe(429); // different spoofed IP, same real client: still limited
    await new Promise<void>((resolve) => server.close(() => resolve()));

    await start({ publicMax: 1, config: { trustProxy: true } });
    expect((await spoof(1)).status).toBe(404);
    expect((await spoof(2)).status).toBe(404); // behind a trusted proxy the forwarded IP is used
    expect((await spoof(1)).status).toBe(429);
  });

  it('returns a generic 500 and reports the error without leaking details', async () => {
    await start();
    const cookie = await login();
    store.list = () => {
      throw new Error('database exploded: secret-detail');
    };
    const response = await call('/admin', { headers: { cookie } });
    expect(response.status).toBe(500);
    expect(response.body).toContain('Something went wrong');
    expect(response.body).not.toContain('secret-detail');
    expect(errors).toHaveLength(1);
  });
});
