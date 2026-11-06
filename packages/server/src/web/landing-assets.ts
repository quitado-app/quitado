// Styles for the home page. They sit on top of APP_CSS (same tokens, same flat world) and add the
// scale a landing page needs. Everything is scoped to .landing, and nothing needs JavaScript: the
// example invoice settles as the visitor scrolls, driven by CSS scroll timelines.

export const LANDING_CSS = `
/* ---- Browser surfaces: the parts the browser draws, themed from the palette ---------------- */
:root {
  accent-color: var(--accent);
  caret-color: var(--accent);
  scrollbar-color: color-mix(in srgb, var(--muted) 60%, var(--bg)) var(--bg);
}
::selection {
  background: color-mix(in srgb, var(--accent) 28%, transparent);
  color: inherit;
}
html {
  scroll-behavior: smooth;
  scroll-padding-top: 24px;
  -webkit-text-size-adjust: 100%;
}
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
@media (prefers-reduced-motion: no-preference) {
  /* Switching language cross-fades instead of flashing. */
  @view-transition { navigation: auto; }
}
@media (prefers-contrast: more) {
  :root { --line: color-mix(in srgb, var(--text) 55%, var(--bg)); --muted: color-mix(in srgb, var(--text) 80%, var(--bg)); }
}

/* A number that the example invoice and the step markers animate: 0 is "not yet", 1 is "done". */
@property --lit {
  syntax: '<number>';
  inherits: true;
  initial-value: 0;
}

.landing {
  --measure: 62ch;
  --section-gap: clamp(72px, 10vw, 120px);
  font-size: 1.0625rem;
  line-height: 1.6;
  text-rendering: optimizeLegibility;
}
.landing :where(h1, h2, h3, summary) { text-wrap: balance; }
.landing :where(p, li, dd) { text-wrap: pretty; }
.landing a { text-underline-offset: 0.18em; text-decoration-thickness: 1px; }
.landing a:hover { text-decoration-thickness: 2px; }
.landing :focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}
.shell { width: min(1120px, 100% - 32px); margin-inline: auto; }
@media (min-width: 640px) {
  .shell { width: min(1120px, 100% - 64px); }
}

.skip {
  position: absolute; left: 16px; top: -120px; z-index: 10;
  background: var(--card); color: var(--text); border: 1px solid var(--line);
  padding: 10px 16px; border-radius: 8px; font-weight: 600;
}
.skip:focus-visible { top: 12px; }

/* ---- Header -------------------------------------------------------------------------------- */
.site-header .shell {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 4px 24px; padding-block: 12px;
}
.landing .brand {
  display: inline-flex; align-items: center; min-height: 44px;
  font-size: 1.2rem; font-weight: 700; letter-spacing: -0.01em;
  color: var(--text); text-decoration: none;
}
.header-links { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; }
.header-link { display: inline-flex; align-items: center; min-height: 44px; }

/* ---- Lifecycle: headline, example invoice and steps share one grid ------------------------- */
.lifecycle {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "hero" "sample" "steps";
  row-gap: 40px;
  padding-top: clamp(24px, 5vw, 72px);
  timeline-scope: --s1, --s2, --s3, --s4;
}
.hero { grid-area: hero; }
.sample-wrap { grid-area: sample; container-type: inline-size; container-name: sample; }
.steps-section { grid-area: steps; }

.landing h1 {
  font-size: clamp(2.1rem, 1.25rem + 3.8vw, 3.6rem);
  line-height: 1.06;
  letter-spacing: -0.028em;
  margin: 0 0 24px;
  max-width: 17em;
}
.landing h2 {
  font-size: clamp(1.55rem, 1.1rem + 1.7vw, 2.2rem);
  line-height: 1.15;
  letter-spacing: -0.018em;
  margin: 0 0 16px;
}
.landing h3 { font-size: 1.25rem; line-height: 1.3; margin: 0 0 6px; }
.lead { font-size: 1.25rem; line-height: 1.55; max-width: 36em; margin: 0 0 14px; }
.promise { font-size: 1.25rem; font-weight: 600; max-width: 36em; margin: 0; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.button-lg {
  min-height: 48px; padding: 12px 22px; font-size: 1.0625rem;
  display: inline-flex; align-items: center; justify-content: center;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.18s ease;
}
.button-lg:hover { background: color-mix(in srgb, var(--accent) 86%, var(--text)); }
.button-lg.secondary:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.button-lg:active { transform: translateY(1px); }
.landing .button, .landing .button:hover { text-decoration: none; }
.banner.early { display: inline-block; margin: 28px 0 0; font-weight: 600; }
.tokens { max-width: 36em; margin: 14px 0 0; font-size: 0.95rem; }

@media (max-width: 640px) {
  .actions .button { display: flex; width: 100%; }
}

/* ---- The example invoice -------------------------------------------------------------------- */
.sample {
  margin: 0;
  background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: clamp(18px, 6cqi, 28px);
}
.sample-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.sample-head .label { max-width: 18em; }
.chips { display: inline-grid; }
.chips > .chip { grid-area: 1 / 1; justify-self: end; }
.chips > .chip-paid { opacity: var(--lit, 0); }
.chips > .chip-open { opacity: calc(1 - var(--lit, 0)); }
.sample-amount {
  font-size: clamp(2rem, 11cqi, 2.75rem); font-weight: 700; line-height: 1.1;
  letter-spacing: -0.02em; margin: 14px 0 18px; font-variant-numeric: tabular-nums;
}
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 14px 24px; margin: 0; }
.facts dd { margin: 2px 0 0; overflow-wrap: anywhere; }
.facts .wide { grid-column: 1 / -1; }
.facts .wide dd { color: var(--muted); }
.receipt .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.events { list-style: none; margin: 22px 0 0; padding: 0; }
.events li {
  position: relative; padding: 11px 0 11px 30px; border-top: 1px solid var(--line);
  color: color-mix(in srgb, var(--text) calc(var(--lit, 0) * 100%), var(--muted));
  font-variant-numeric: tabular-nums;
}
.events li::before {
  content: ""; position: absolute; left: 0; top: 0.95em; width: 14px; height: 14px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--ok) calc(var(--lit, 0) * 100%), var(--line));
  background: color-mix(in srgb, var(--ok) calc(var(--lit, 0) * 100%), var(--card));
}
.events li:first-child { --lit: 1; }
@container sample (min-width: 400px) {
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 900px) {
  .lifecycle {
    grid-template-columns: minmax(0, 1fr) minmax(340px, 430px);
    grid-template-areas: "hero sample" "steps sample";
    column-gap: clamp(40px, 6vw, 96px);
    row-gap: 0;
  }
  .hero { padding-bottom: clamp(48px, 8vw, 96px); }
  .sample { position: sticky; top: 24px; }
}

/* ---- Steps ---------------------------------------------------------------------------------- */
.steps-section h2 { margin-bottom: 28px; }
.steps { list-style: none; margin: 0; padding: 0; counter-reset: step; }
.steps > li {
  position: relative; counter-increment: step;
  padding: 0 0 clamp(36px, 6vw, 64px) 58px; max-width: 40em;
}
.steps > li::before {
  content: counter(step);
  position: absolute; left: 0; top: 0; width: 36px; height: 36px; border-radius: 999px;
  display: grid; place-items: center;
  font: 600 0.95rem ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-variant-numeric: tabular-nums;
  border: 1px solid color-mix(in srgb, var(--ok) calc(var(--lit, 0) * 100%), var(--line));
  background: color-mix(in srgb, var(--ok) calc(var(--lit, 0) * 100%), var(--card));
  color: color-mix(in srgb, var(--card) calc(var(--lit, 0) * 100%), var(--muted));
}
.steps > li::after {
  content: ""; position: absolute; left: 17.5px; top: 46px; bottom: 10px; width: 1px; background: var(--line);
}
.steps > li:last-child { padding-bottom: 0; }
.steps > li:last-child::after { display: none; }
.steps p { margin: 0; max-width: var(--measure); }

.receipt {
  margin: 24px 0 0; background: var(--card); border: 1px solid var(--line); border-radius: 12px;
  padding: 18px 20px; max-width: 30em;
}
.receipt figcaption { display: block; margin-bottom: 12px; }
.receipt-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.receipt-title { margin: 0; font-weight: 700; }
.receipt-amount { font-size: 2rem; font-weight: 700; letter-spacing: -0.015em; margin: 8px 0 14px; font-variant-numeric: tabular-nums; }
.receipt .muted { margin: 14px 0 0; font-size: 0.9rem; }

/* The settling is a scroll-driven moment, only where there is room for the card to stay in view,
   and only for visitors who have not asked for less motion. */
@media (min-width: 900px) and (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    @keyframes settle { to { --lit: 1; } }
    .steps > li:nth-child(1) { view-timeline: --s1 block; }
    .steps > li:nth-child(2) { view-timeline: --s2 block; }
    .steps > li:nth-child(3) { view-timeline: --s3 block; }
    .steps > li:nth-child(4) { view-timeline: --s4 block; }
    .steps > li { min-block-size: 36svh; }
    .steps > li:last-child { min-block-size: 0; }

    .steps > li:nth-child(1)::before { animation: settle linear both; animation-timeline: --s1; animation-range: cover 30% cover 40%; }
    .steps > li:nth-child(2)::before { animation: settle linear both; animation-timeline: --s2; animation-range: cover 30% cover 40%; }
    .steps > li:nth-child(3)::before { animation: settle linear both; animation-timeline: --s3; animation-range: cover 30% cover 40%; }
    .steps > li:nth-child(4)::before { animation: settle linear both; animation-timeline: --s4; animation-range: cover 30% cover 40%; }

    /* The card follows the steps: each event lights up as its step reaches the middle of the screen. */
    .events li:nth-child(2) { animation: settle linear both; animation-timeline: --s2; animation-range: cover 30% cover 40%; }
    .events li:nth-child(3) { animation: settle linear both; animation-timeline: --s3; animation-range: cover 30% cover 40%; }
    .events li:nth-child(4) { animation: settle linear both; animation-timeline: --s4; animation-range: cover 30% cover 40%; }
    .chips { animation: settle linear both; animation-timeline: --s3; animation-range: cover 30% cover 40%; }
  }
}

/* ---- Sections -------------------------------------------------------------------------------- */
.section { margin-top: var(--section-gap); }
.section > h2 { max-width: 20em; }
.intro { max-width: var(--measure); color: var(--muted); margin: 0 0 8px; }

.cols { display: grid; gap: 40px 56px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr)); margin-top: 28px; }
.cols h3 { margin-bottom: 12px; }
.marks { list-style: none; margin: 0; padding: 0; }
.marks li { position: relative; padding: 14px 0 14px 30px; border-top: 1px solid var(--line); max-width: 36em; }
.marks li:last-child { border-bottom: 1px solid var(--line); }
.marks li::before { content: ""; position: absolute; left: 4px; top: 1.45em; width: 10px; height: 10px; border-radius: 999px; box-sizing: border-box; }
.marks-does li::before { background: var(--text); }
.marks-not li::before { border: 1.5px solid var(--muted); }

.ledger { margin: 28px 0 0; border-bottom: 1px solid var(--line); }
.ledger > div {
  display: grid; grid-template-columns: minmax(0, 15rem) minmax(0, 1fr); gap: 6px 40px;
  padding: 22px 0; border-top: 1px solid var(--line);
}
.ledger dt { font-weight: 700; }
.ledger dd { margin: 0; }
.ledger dd p { margin: 0 0 6px; max-width: var(--measure); }
@media (max-width: 720px) {
  .ledger > div { grid-template-columns: minmax(0, 1fr); }
}

.run { display: grid; gap: 32px 48px; grid-template-columns: repeat(auto-fit, minmax(min(100%, 330px), 1fr)); margin-top: 28px; align-items: start; }
.needs { margin: 0; }
.command { margin: 0; }
.command pre {
  margin: 0 0 14px; padding: 14px 16px; background: var(--card); border: 1px solid var(--line); border-radius: 8px;
  overflow-x: auto; white-space: pre; word-break: normal; line-height: 1.7;
}
.command p { margin: 0 0 14px; font-size: 0.95rem; }
.run-action { margin: 32px 0 0; }

.faq { max-width: 46em; }
.faq details { border-top: 1px solid var(--line); }
.faq details:last-of-type { border-bottom: 1px solid var(--line); }
.faq summary {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  min-height: 56px; padding: 14px 0; font-weight: 600; cursor: pointer; list-style: none;
}
.faq summary::-webkit-details-marker { display: none; }
.faq summary::after {
  content: ""; flex: none; width: 9px; height: 9px;
  border-right: 2px solid var(--muted); border-bottom: 2px solid var(--muted);
  transform: translateY(-2px) rotate(45deg); transition: transform 0.2s ease;
}
.faq details[open] > summary::after { transform: translateY(2px) rotate(-135deg); }
.faq summary:hover { color: var(--accent); }
.faq details p { margin: 0 0 18px; max-width: var(--measure); color: var(--muted); }
@supports (interpolate-size: allow-keywords) {
  .faq { interpolate-size: allow-keywords; }
  .faq details::details-content {
    block-size: 0; overflow: clip;
    transition: block-size 0.25s ease, content-visibility 0.25s ease allow-discrete;
  }
  .faq details[open]::details-content { block-size: auto; }
}


/* A laptop screen is short: keep the whole example card in view while it is stuck. */
@media (min-width: 900px) and (max-height: 760px) {
  .lifecycle { padding-top: 16px; }
  .sample { padding: 16px 20px; top: 12px; }
  .sample-amount { font-size: 2.25rem; margin: 8px 0 12px; }
  .facts { gap: 10px 24px; }
  .facts .wide, .facts > div:nth-child(3) { display: none; }
  .events { margin-top: 14px; }
  .events li { padding-block: 7px; }
  .events li::before { top: 0.7em; }
}

@media (prefers-reduced-motion: reduce) {
  .button-lg, .faq summary::after, .faq details::details-content { transition: none; }
}

/* ---- Footer ---------------------------------------------------------------------------------- */
.site-footer { text-align: left; margin-top: var(--section-gap); border-top: 1px solid var(--line); padding-block: 32px 56px; color: var(--muted); font-size: 0.95rem; }
.site-footer p { margin: 0 0 8px; max-width: var(--measure); }
.footer-links { display: flex; flex-wrap: wrap; gap: 0 20px; }
.footer-links a { display: inline-flex; align-items: center; min-height: 44px; }

/* ---- Other environments ---------------------------------------------------------------------- */
@media (forced-colors: active) {
  .chip, .sample, .receipt, .command pre { border: 1px solid CanvasText; }
  .events li::before, .steps > li::before { forced-color-adjust: none; border-color: CanvasText; }
}
@media print {
  .site-header, .skip, .actions, .command button, .lang { display: none; }
  .sample { position: static; }
  .faq details > p { display: block; }
}
`;
