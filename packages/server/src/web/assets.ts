// Static files served by the app. Kept as strings so a build has nothing to copy, and so the
// Content-Security-Policy can forbid inline styles and scripts: everything is loaded from 'self'.

export const APP_CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f9;
  --card: #ffffff;
  --text: #16181d;
  --muted: #5d6573;
  --line: #dfe3ea;
  --accent: #0b5fff;
  --accent-text: #ffffff;
  --ok: #0a7d3b;
  --ok-bg: #e3f6ea;
  --warn: #8a5a00;
  --warn-bg: #fff2d6;
  --bad: #a3271f;
  --bad-bg: #fde8e6;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1115;
    --card: #181b21;
    --text: #eceef2;
    --muted: #a0a8b6;
    --line: #2b303a;
    --accent: #5b8cff;
    --accent-text: #0b0d12;
    --ok: #5ed08a;
    --ok-bg: #12301f;
    --warn: #f0c060;
    --warn-bg: #33270b;
    --bad: #ff8a80;
    --bad-bg: #381614;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
header.top {
  display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between;
  margin-bottom: 24px;
}
header.top nav { display: flex; gap: 16px; align-items: center; }
.brand { font-weight: 700; letter-spacing: 0.01em; }
a { color: var(--accent); }
h1 { font-size: 1.6rem; margin: 0 0 8px; }
h2 { font-size: 1.1rem; margin: 24px 0 8px; }
.card {
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 20px; margin-bottom: 16px;
}
.muted { color: var(--muted); }
.amount { font-size: 2rem; font-weight: 700; }
.row { display: flex; flex-wrap: wrap; gap: 8px 24px; margin: 8px 0; }
.row > div { min-width: 140px; }
.label { display: block; font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
.chip { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.85rem; font-weight: 600; }
.chip-open { background: var(--warn-bg); color: var(--warn); }
.chip-overdue { background: var(--bad-bg); color: var(--bad); }
.chip-paid { background: var(--ok-bg); color: var(--ok); }
.banner { border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; background: var(--warn-bg); color: var(--warn); font-weight: 600; }
.error { border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; background: var(--bad-bg); color: var(--bad); }
.qr { background: #fff; padding: 12px; border-radius: 12px; width: 240px; max-width: 100%; margin: 16px auto; }
.qr svg { display: block; width: 100%; height: auto; }
.center { text-align: center; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.85rem; word-break: break-all; }
.button, button {
  display: inline-block; padding: 10px 18px; border-radius: 8px; border: 1px solid var(--accent);
  background: var(--accent); color: var(--accent-text); font: inherit; font-weight: 600;
  text-decoration: none; cursor: pointer;
}
button.secondary, .button.secondary { background: transparent; color: var(--accent); }
button.link { background: none; border: none; padding: 0; color: var(--accent); font-weight: 400; text-decoration: underline; }
form.inline { display: inline; }
label { display: block; font-weight: 600; margin: 14px 0 4px; }
input, select, textarea {
  width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--line);
  background: var(--bg); color: var(--text); font: inherit;
}
textarea { min-height: 90px; resize: vertical; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 0.8rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.04em; }
td.num, th.num { text-align: right; white-space: nowrap; }
td.nowrap { white-space: nowrap; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 16px 0; }
.tile { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.tile .figure { display: block; font-size: 1.6rem; font-weight: 700; }
.copy-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.copy-row .mono { flex: 1 1 260px; }
footer { margin-top: 32px; font-size: 0.85rem; color: var(--muted); text-align: center; }
`;

export const APP_JS = `
(() => {
  'use strict';

  // Copy buttons: <button data-copy="text">.
  document.addEventListener('click', async (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-copy]') : null;
    if (!target) return;
    const original = target.textContent;
    try {
      await navigator.clipboard.writeText(target.getAttribute('data-copy') || '');
      target.textContent = 'Copied';
      setTimeout(() => { target.textContent = original; }, 1500);
    } catch (error) {
      // Clipboard not available (for example plain http): the text stays selectable.
    }
  });

  // Payment page: poll the status and reload as soon as the invoice is paid.
  const root = document.getElementById('pay-root');
  const url = root && root.getAttribute('data-status-url');
  if (!url) return;
  const poll = async () => {
    try {
      const response = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (response.ok) {
        const data = await response.json();
        if (data.paid) { location.reload(); return; }
      }
    } catch (error) {
      // Offline or the server is restarting: try again.
    }
    setTimeout(poll, 4000);
  };
  setTimeout(poll, 4000);
})();
`;
