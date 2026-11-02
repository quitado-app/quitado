# Payment receipts

Code: [`packages/server/src/receipt`](../packages/server/src/receipt). The route lives in
[`app.ts`](../packages/server/src/web/app.ts).

## What it is

Once an invoice is paid, `/pay/<id>/receipt.pdf` serves a one-page A4 receipt. It is public like the
payment page: whoever has the invoice link can download it, so the customer gets their own copy
without the owner doing anything. Before the invoice is paid there is no receipt (`404`).

The receipt shows who billed whom, the description, the invoice and due dates, the amount actually
received, when it arrived, the network and token (with its mint), the paying wallet when known, and
the **full transaction signature**. It also carries a clickable link and a QR code to the
transaction on a block explorer, so anyone can verify the payment without trusting Quitado.

It states that it is **not a tax document** (nota fiscal) and does not replace one.

## No PDF library

The PDF is written by a small writer
([`pdf.ts`](../packages/server/src/receipt/pdf.ts)): one page of text, rectangles, lines and link
annotations with the standard PDF fonts. `pdfkit` would have added 20 packages and 24 MB, mostly
for font embedding, images and encryption that a receipt does not use.

- Text widths come from the Adobe AFM metric files of Helvetica and Helvetica-Bold (extracted into
  [`metrics.ts`](../packages/server/src/receipt/metrics.ts)), so wrapping is accurate.
- Content is compressed with `node:zlib`; the cross-reference table is exact.
- Everything that comes from a user is escaped as a PDF string; a hostile client name cannot add
  PDF operators (tested).

## Limits

- **Characters outside Latin text are drawn as `?`.** The standard fonts cover Portuguese, Spanish,
  French and the like, plus common punctuation and the euro sign, but not other scripts or emoji.
  `pdfkit` has the same limit unless a font is embedded. The signature, the link and the QR code are
  plain ASCII, so the payment is always verifiable even if a name loses characters.
- **One page.** A very long description is cut with an ellipsis so the verification block and the
  footer always fit; client and owner names are clipped at two lines. The full text stays on the
  invoice page. A realistic description (a few hundred characters) is never cut.
- Dates are shown in the instance's configured UTC offset (`QUITADO_UTC_OFFSET_MINUTES`).
- The "generated on" time in the footer is the moment of the download, so two downloads differ by
  that line only.

## How it was verified

Besides the unit tests (structure of the file, text, escaping, wrapping, clipping), a real receipt
was produced from a payment on devnet and checked with tools independent of this code:

- **PyMuPDF** opened it without needing to repair it, and read the metadata, the text and the links.
- Rendering it and comparing every module of the QR code against the expected matrix: **0 of 2,401
  differ**.
- A separate QR decoder (**jsQR**) read the QR code of the receipt, and the one on the payment page,
  and both decode to exactly the intended text (the explorer link, and the Solana Pay URL).

Not done: scanning with a real wallet app on a phone. That is part of the mainnet step.
