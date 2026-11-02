import { correction, generate } from 'lean-qr';
import { toSvgSource } from 'lean-qr/extras/svg';

/**
 * Renders `text` as an inline SVG QR code. Medium error correction keeps it scannable from a
 * screen with glare. Colors are fixed (black on white) so it scans in dark mode too. The output is
 * generated from numbers only, never from user text, so it is safe to inline in HTML.
 */
export function qrSvg(text: string): string {
  const code = generate(text, { minCorrectionLevel: correction.M });
  return toSvgSource(code, { on: '#000', off: '#fff', padX: 2, padY: 2 });
}
