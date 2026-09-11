/** Colour maths in OKLab. sRGB/HSL tints go muddy or neon when you shift
 *  lightness; OKLab is perceptually uniform, so a derived ramp keeps its hue. */

export type RGB = { r: number; g: number; b: number };      // 0..255
export type Lab = { L: number; a: number; b: number };      // OKLab

export function hexToRgb(hex: string): RGB {
  const v = hex.replace('#', '');
  const s = v.length === 3 ? v.split('').map((c) => c + c).join('') : v.slice(0, 6);
  const n = parseInt(s, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbToHex = ({ r, g, b }: RGB) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

const toLinear = (c: number) => { const x = c / 255; return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const fromLinear = (x: number) => 255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055);

export function rgbToOklab({ r, g, b }: RGB): Lab {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

export function oklabToRgb({ L, a, b }: Lab): RGB {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return {
    r: fromLinear(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  };
}

export const hexToOklab = (hex: string) => rgbToOklab(hexToRgb(hex));
export const oklabToHex = (lab: Lab) => rgbToHex(oklabToRgb(lab));

/** Chroma and hue, for rotating a hue without shifting its perceived weight. */
export const chroma = ({ a, b }: Lab) => Math.hypot(a, b);
export const hue = ({ a, b }: Lab) => Math.atan2(b, a);
export const fromLCh = (L: number, C: number, h: number): Lab => ({ L, a: C * Math.cos(h), b: C * Math.sin(h) });

/** Move a colour toward a target lightness, keeping hue and (scaled) chroma. */
export function atLightness(hex: string, L: number, chromaScale = 1): string {
  const lab = hexToOklab(hex);
  return oklabToHex(fromLCh(L, chroma(lab) * chromaScale, hue(lab)));
}

/** Rotate hue by degrees — how a support colour is derived from a brand colour. */
export function rotateHue(hex: string, degrees: number): string {
  const lab = hexToOklab(hex);
  return oklabToHex(fromLCh(lab.L, chroma(lab), hue(lab) + (degrees * Math.PI) / 180));
}

export function mix(a: string, b: string, t: number): string {
  const A = hexToOklab(a), B = hexToOklab(b);
  return oklabToHex({ L: A.L + (B.L - A.L) * t, a: A.a + (B.a - A.a) * t, b: A.b + (B.b - A.b) * t });
}

/** WCAG relative luminance and contrast ratio — the readability floor. */
export function luminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(fg: string, bg: string): number {
  const a = luminance(fg), b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Push a colour's lightness until it clears a contrast ratio against bg.
 *  Returns the original when it already passes, so authored colours survive. */
export function ensureContrast(fg: string, bg: string, ratio: number): { hex: string; adjusted: boolean; from: number; to: number } {
  const start = contrast(fg, bg);
  if (start >= ratio) return { hex: fg, adjusted: false, from: start, to: start };
  const bgL = hexToOklab(bg).L;
  const dir = bgL < 0.5 ? 1 : -1;          // dark ground → lighten the text, and vice versa
  const lab = hexToOklab(fg);
  let best = fg, bestC = start;
  for (let step = 1; step <= 60; step++) {
    const L = Math.max(0, Math.min(1, lab.L + dir * step * 0.0125));
    const cand = oklabToHex(fromLCh(L, chroma(lab), hue(lab)));
    const c = contrast(cand, bg);
    if (c > bestC) { best = cand; bestC = c; }
    if (c >= ratio) return { hex: cand, adjusted: true, from: start, to: c };
    if (L === 0 || L === 1) break;
  }
  return { hex: best, adjusted: true, from: start, to: bestC };
}
