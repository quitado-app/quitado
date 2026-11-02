// Glyph advance widths (1/1000 em) extracted from the Adobe Helvetica and Helvetica-Bold AFM metric
// files that ship with the standard 14 PDF fonts.
// The arrays cover ASCII 32 to 126 (index = char code - 32); the records cover the other characters
// WinAnsi can draw that we support. Courier is monospaced at 600.

export const HELVETICA: readonly number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

export const HELVETICA_BOLD: readonly number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667,
  611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556,
  278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

export const HELVETICA_EXTRA: Readonly<Record<string, number>> = {
  '\u2026': 1000,
  '\u2014': 1000,
  '\u2013': 556,
  '\u2022': 350,
  '\u20ac': 556,
  '\u2018': 222,
  '\u2019': 222,
  '\u201c': 333,
  '\u201d': 333,
};

export const HELVETICA_BOLD_EXTRA: Readonly<Record<string, number>> = {
  '\u2026': 1000,
  '\u2014': 1000,
  '\u2013': 556,
  '\u2022': 350,
  '\u20ac': 556,
  '\u2018': 278,
  '\u2019': 278,
  '\u201c': 500,
  '\u201d': 500,
};

export const COURIER_WIDTH = 600;
