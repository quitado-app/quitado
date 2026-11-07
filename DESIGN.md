---
name: Quitado
description: Open-source, non-custodial USDC/USDT invoicing on Solana. Precise, firm and checkable.
colors:
  canvas: '#f6f7f9'
  surface: '#ffffff'
  ink: '#16181d'
  ink-muted: '#5d6573'
  hairline: '#dfe3ea'
  signal-blue: '#0b5fff'
  on-signal: '#ffffff'
  settled-green: '#0a7d3b'
  settled-wash: '#e3f6ea'
  pending-amber: '#8a5a00'
  pending-wash: '#fff2d6'
  overdue-red: '#a3271f'
  overdue-wash: '#fde8e6'
  canvas-night: '#0f1115'
  surface-night: '#181b21'
  ink-night: '#eceef2'
  ink-muted-night: '#a0a8b6'
  hairline-night: '#2b303a'
  signal-blue-night: '#5b8cff'
  on-signal-night: '#0b0d12'
  settled-green-night: '#5ed08a'
  settled-wash-night: '#12301f'
  pending-amber-night: '#f0c060'
  pending-wash-night: '#33270b'
  overdue-red-night: '#ff8a80'
  overdue-wash-night: '#381614'
typography:
  display:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '2rem'
    fontWeight: 700
    lineHeight: 1.5
  headline:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '1.6rem'
    fontWeight: 700
    lineHeight: 1.5
  title:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '1.1rem'
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: '0.8rem'
    fontWeight: 400
    letterSpacing: '0.04em'
  mono:
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
    fontSize: '0.85rem'
    fontWeight: 400
    lineHeight: 1.5
rounded:
  sm: '8px'
  md: '12px'
  pill: '999px'
spacing:
  xs: '8px'
  sm: '12px'
  md: '16px'
  lg: '24px'
components:
  button-primary:
    backgroundColor: '{colors.signal-blue}'
    textColor: '{colors.on-signal}'
    rounded: '{rounded.sm}'
    padding: '10px 18px'
  button-secondary:
    backgroundColor: 'transparent'
    textColor: '{colors.signal-blue}'
    rounded: '{rounded.sm}'
    padding: '10px 18px'
  card:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '20px'
  tile:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.ink}'
    rounded: '{rounded.md}'
    padding: '14px 16px'
  input:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    rounded: '{rounded.sm}'
    padding: '10px 12px'
  chip-open:
    backgroundColor: '{colors.pending-wash}'
    textColor: '{colors.pending-amber}'
    rounded: '{rounded.pill}'
    padding: '2px 10px'
  chip-overdue:
    backgroundColor: '{colors.overdue-wash}'
    textColor: '{colors.overdue-red}'
    rounded: '{rounded.pill}'
    padding: '2px 10px'
  chip-paid:
    backgroundColor: '{colors.settled-wash}'
    textColor: '{colors.settled-green}'
    rounded: '{rounded.pill}'
    padding: '2px 10px'
  banner:
    backgroundColor: '{colors.pending-wash}'
    textColor: '{colors.pending-amber}'
    rounded: '{rounded.sm}'
    padding: '10px 14px'
  error:
    backgroundColor: '{colors.overdue-wash}'
    textColor: '{colors.overdue-red}'
    rounded: '{rounded.sm}'
    padding: '10px 14px'
---

# Design System: Quitado

This file records the visual system as it is implemented today in `packages/server/src/web/assets.ts`, plus the direction confirmed with the product owner. `PRODUCT.md` holds who it is for and what it does.

## Overview

**Creative North Star: "The Open Ledger"**

Quitado looks like a ledger page that anyone is allowed to read: every number is where you expect it, labelled, and exact. The person paying and the person being paid see the same facts, and anything that can be checked on-chain is presented as a fact to check, not as decoration. The interface is precise and technical in tone, but it is not cold: actions are firm and unmissable, so a payer on a phone never has to hunt for the next step.

It is flat and quiet. There are no shadows, gradients or ornamental imagery; structure comes from hairline borders, generous spacing and a small set of status colors that always mean the same thing. The system uses the operating system's own font and respects the visitor's light or dark preference, so it loads instantly and carries no third-party assets.

**Key Characteristics:**

- Flat surfaces separated by 1px hairlines, never by shadow.
- One accent color for actions; three status colors for state (settled, pending, overdue), never mixed up.
- Amounts are the loudest thing on the page; metadata is small, uppercase and muted.
- Addresses and signatures are shown in monospace and are always selectable or copyable.
- Everything ships from `'self'`: system fonts, inline-free CSS, no external requests.

## Colors

A cool neutral canvas with a single saturated blue and three semantic status pairs. Every color has a light and a night value, chosen by `prefers-color-scheme`; each status color pairs with a tinted wash of its own hue for backgrounds.

### Primary

- **Signal Blue** (#0b5fff, night #5b8cff): the only action color. Primary buttons, links, secondary-button outline and text. Its text-on color flips (white on light, near-black #0b0d12 on night) so contrast holds in both themes.

### Neutral

- **Canvas** (#f6f7f9, night #0f1115): the page background, and the fill of form fields so they read as recessed against cards.
- **Surface** (#ffffff, night #181b21): cards and tiles.
- **Ink** (#16181d, night #eceef2): body text.
- **Ink Muted** (#5d6573, night #a0a8b6): labels, secondary lines, table headers, footer.
- **Hairline** (#dfe3ea, night #2b303a): every border and divider.

### Status

- **Settled Green** (#0a7d3b, night #5ed08a) on **Settled Wash** (#e3f6ea, night #12301f): paid.
- **Pending Amber** (#8a5a00, night #f0c060) on **Pending Wash** (#fff2d6, night #33270b): open invoices and informational banners.
- **Overdue Red** (#a3271f, night #ff8a80) on **Overdue Wash** (#fde8e6, night #381614): overdue invoices and errors.

### Named Rules

**The One Action Color Rule.** Blue means "you can act here". It is never used to show state, and state colors are never used on buttons.

**The Status Means One Thing Rule.** Green is paid, amber is open, red is overdue or failed. A new state gets its own treatment; it does not borrow one of these.

**The QR White Rule.** A QR code always sits on a white tile with padding, in both themes. It is the only element that stays white at night, because wallets scan against a light quiet zone.

## Typography

**Display, Body and Label Font:** the system UI stack (`system-ui`, `-apple-system`, `Segoe UI`, `Roboto`, `sans-serif`)
**Mono Font:** `ui-monospace`, `SFMono-Regular`, `Menlo`, `Consolas`, `monospace`

**Character:** Native and unadorned: the page feels like part of the device. Hierarchy comes from size and weight alone, with uppercase micro-labels naming each value.

### Hierarchy

- **Display** (700, 2rem, 1.5): the invoice amount on the payment page and nowhere else.
- **Headline** (700, 1.6rem, 1.5): page titles, and the figure inside a stats tile.
- **Title** (700, 1.1rem, 1.5): section headings inside a page.
- **Body** (400, 1rem, 1.5): everything else. Text blocks stay within the 760px column, roughly 75 characters.
- **Label** (400, 0.8rem, +0.04em, uppercase, muted): names a value, and heads table columns.
- **Mono** (400, 0.85rem): addresses, references, signatures and the payment link; always allowed to wrap anywhere so it never forces horizontal scroll.

### Named Rules

**The Amount First Rule.** The amount and its asset are the largest text on a payment surface. Nothing else competes with them for size or weight.

**The Real Numbers Rule.** Money, dates and counts are shown exactly as the server holds them. Never abbreviate, round or localize a figure in a way that changes what it says.

## Layout

A single centered column, 760px maximum, with 16px side padding on small screens, 24px at the top and 64px at the bottom. A header row holds the brand on the left and navigation on the right and wraps on narrow screens. Content stacks as cards; related facts sit in wrapping rows with a 140px minimum column and an 8px by 24px gap. Stats are an auto-fit grid of tiles (150px minimum, 12px gap). Spacing follows a loose 4px rhythm (8, 12, 16, 20, 24), with 24px between sections and 16px between cards.

The layout is mobile-first by construction: there are no fixed widths other than the 240px QR code (capped at 100% of its container), and tables use right-aligned, non-wrapping numeric columns.

## Elevation & Depth

None. The system is flat by design: depth comes from tone (a white card on a grey canvas, a recessed canvas-colored field inside a card) and a 1px hairline border. There are no shadows, blurs or overlays, and no motion beyond the browser default, except the scroll-driven settling of the example invoice on the home page (see Landing page). State changes are shown by content and color, not by animation.

### Named Rules

**The Flat-By-Default Rule.** A surface never gains a shadow to look more important. Importance comes from position, size and the action color.

## Shapes

Softly squared. Cards, tiles and the QR tile use a 12px radius; buttons, fields and banners use 8px; status chips are fully round (999px). Every container has a 1px hairline border except banners and error messages, which are filled with their wash color and carry no border. There are no clipped, angled or decorative shapes.

## Components

### Buttons

- **Shape:** 8px radius, 1px border in the same color as its fill.
- **Primary:** Signal Blue fill, on-signal text, 10px by 18px padding, weight 600, about 46px tall. It is the single most prominent action on a screen.
- **Secondary:** transparent fill, Signal Blue text and border.
- **Link button:** no fill, no border, blue underlined text, weight 400; used for low-stakes inline actions such as sign out.
- **Focus:** every link, button, field and summary shows a 3px outline in the action colour, 2px off the element, on keyboard focus (:focus-visible). The colour keeps at least 3:1 against the canvas and the card in both themes.

### Chips

- **Style:** pill, 2px by 10px padding, 0.85rem, weight 600, wash background with the matching status color for text.
- **State:** open (amber), overdue (red), paid (green).

### Cards / Containers

- **Corner Style:** 12px.
- **Background:** Surface.
- **Shadow Strategy:** none; see Elevation & Depth.
- **Border:** 1px Hairline.
- **Internal Padding:** 20px (cards), 14px by 16px (stats tiles).

### Inputs / Fields

- **Style:** full width, 1px Hairline border, 8px radius, Canvas fill, inherited font, 10px by 12px padding. Labels sit above the field in weight 600.
- **Border:** the border of a field is --field-line, a mix of Ink Muted into the card (3:1 or more against the card and the canvas, in both themes), not the Hairline, which only separates things. **Focus:** the same 3px action-colour outline as every control.
- **Error / Disabled:** errors appear as a red banner above the form, not beside the field.

### Navigation

- A plain row of text links in Signal Blue at the top right of the header, 16px apart, next to a bold wordmark. There is no menu and no mobile variant: the row wraps. Each link is at least 44px tall, and the one for the page being shown is bold, in Ink, and carries ria-current=" page\.

### Payment Tile (signature)

The QR code in a 240px white tile, centered, 12px radius, 12px padding, with the recipient address below it in monospace next to a secondary Copy button. It is the one place on the product where a visitor often has to act with a device other than the one they are reading on. The same copy-row pattern (monospace text plus a secondary Copy button) holds the payment link on the owner's invoice page.

### Tables

Full width, hairline row dividers, muted uppercase headers, 10px by 8px cell padding, numeric columns right-aligned and non-wrapping.

## Landing page (site scale)

The project's home page (`web/landing.ts`, `web/landing-assets.ts`, served as `/static/landing.css` on top of `app.css`) lives in the same world and adds only what a page for strangers needs. It is the one place the system is scaled up; the app and the payment page are unchanged.

- **Scale.** Headline fluid from 2.1rem to 3.6rem, section titles 1.55rem to 2.2rem, body 1.0625rem, lead text 1.25rem, in a 1120px shell. On this page the headline is the loudest text; the **Amount First Rule** still governs the example invoice and every payment surface.
- **One authored moment.** The example invoice is sticky beside the steps and settles from open (amber chip) to paid (green chip) as each step passes the middle of the screen, with its four events lighting in turn. It is CSS only: named view timelines on the steps, a registered `--lit` number (`@property`) animated from 0 to 1, and `color-mix()` to turn it into colour. It runs only from 900px wide and for visitors who have not asked for reduced motion; everywhere else the card stays in its open state and the steps carry the story.
- **Other CSS the page uses.** Container queries on the example card, `text-wrap: balance` and `pretty`, `:focus-visible` rings in the action colour, themed `::selection`, scrollbar, caret and accent, `details` that animate open where `interpolate-size` exists, a cross-fade between languages with `@view-transition`, and `forced-colors`, `prefers-contrast`, `prefers-reduced-motion` and print rules. No JavaScript is added besides the copy button already in `app.js`.
- **Still true.** Flat surfaces with hairlines, system fonts, no gradients or shadows, status colours only for status, every file from the same origin.
- **Illustrative data.** The invoice and receipt on the page are labelled as examples and use made-up names; nothing on the page is a customer, a number or a testimonial.

## Do's and Don'ts

### Do:

- **Do** keep every asset on the same origin; system fonts and CSS from `'self'` only (a strict Content-Security-Policy forbids anything else).
- **Do** support both themes with the paired tokens; test every new color in light and night.
- **Do** keep primary actions at least 44px tall and full-width on narrow screens.
- **Do** name the network and show the recipient address wherever money is requested.
- **Do** use the status colors only for status, and the wash color for the background behind them.

### Don't:

- **Don't** add shadows, gradients, glassmorphism or decorative imagery.
- **Don't** load web fonts, icon fonts, CDNs, analytics or any third-party script.
- **Don't** invent invoice states: an invoice is `open` or `paid`, and overdue is derived.
- **Don't** put a color value in a component that is not one of the tokens above.
- **Don't** rely on color alone to convey state; every chip and banner carries its meaning in text.
