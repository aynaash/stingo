/** Text measurement, so type can be fitted to the frame instead of overflowing it.
 *
 *  satori does flexbox but will not shrink text to fit: give it a headline
 *  three words too long and it renders it running off the canvas, silently.
 *  Nothing downstream notices, because a frame is just pixels by then. That is
 *  the single easiest way to produce a broken-looking video.
 *
 *  Measuring properly needs glyph advances, which means reading the font. The
 *  tables involved are small and the parsing is boring, so it lives here rather
 *  than pulling in a font library to answer one question per scene.
 *
 *  Kerning is ignored. It moves a line by well under a percent, and every
 *  consumer of this applies a safety margin far larger than that. */

export interface FontMetrics {
  unitsPerEm: number;
  /** advance width in font units, by glyph id */
  advances: Uint16Array;
  /** codepoint → glyph id */
  cmap: Map<number, number>;
  /** advance for glyphs past the hmtx array — monospace fonts lean on this */
  lastAdvance: number;
}

const tag = (dv: DataView, off: number) =>
  String.fromCharCode(dv.getUint8(off), dv.getUint8(off + 1), dv.getUint8(off + 2), dv.getUint8(off + 3));

/** Locate the sfnt tables. Handles both TrueType and CFF/OpenType outlines,
 *  which differ in what they store but not in how they are indexed. */
function tables(dv: DataView): Map<string, { off: number; len: number }> {
  const out = new Map<string, { off: number; len: number }>();
  const n = dv.getUint16(4);
  for (let i = 0; i < n; i++) {
    const rec = 12 + i * 16;
    if (rec + 16 > dv.byteLength) break;
    out.set(tag(dv, rec), { off: dv.getUint32(rec + 8), len: dv.getUint32(rec + 12) });
  }
  return out;
}

function readCmap(dv: DataView, off: number): Map<number, number> {
  const map = new Map<number, number>();
  const n = dv.getUint16(off + 2);

  // prefer a full-Unicode subtable; fall back to the BMP one, then to anything
  let best = -1, bestScore = -1;
  for (let i = 0; i < n; i++) {
    const rec = off + 4 + i * 8;
    const platform = dv.getUint16(rec), encoding = dv.getUint16(rec + 2);
    const sub = off + dv.getUint32(rec + 4);
    const score = platform === 3 && encoding === 10 ? 4
      : platform === 0 && encoding >= 4 ? 3
      : platform === 3 && encoding === 1 ? 2
      : platform === 0 ? 1 : 0;
    if (score > bestScore) { bestScore = score; best = sub; }
  }
  if (best < 0) return map;

  const format = dv.getUint16(best);
  if (format === 4) {
    const segX2 = dv.getUint16(best + 6);
    const segs = segX2 / 2;
    const ends = best + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const ranges = deltas + segX2;
    for (let s = 0; s < segs; s++) {
      const end = dv.getUint16(ends + s * 2);
      const start = dv.getUint16(starts + s * 2);
      const delta = dv.getInt16(deltas + s * 2);
      const rangeOff = dv.getUint16(ranges + s * 2);
      if (start > end) continue;
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (rangeOff === 0) g = (c + delta) & 0xffff;
        else {
          const gi = ranges + s * 2 + rangeOff + (c - start) * 2;
          if (gi + 2 > dv.byteLength) continue;
          g = dv.getUint16(gi);
          if (g !== 0) g = (g + delta) & 0xffff;
        }
        if (g) map.set(c, g);
      }
    }
  } else if (format === 12) {
    const groups = dv.getUint32(best + 12);
    for (let i = 0; i < groups; i++) {
      const g = best + 16 + i * 12;
      if (g + 12 > dv.byteLength) break;
      const start = dv.getUint32(g), end = dv.getUint32(g + 4), gid = dv.getUint32(g + 8);
      // a pathological font could claim a gigantic range; cap the work
      for (let c = start; c <= end && c - start < 0x10000; c++) map.set(c, gid + (c - start));
    }
  }
  return map;
}

/** Read the metrics needed to measure a string. Throws only on a font so
 *  malformed it has no head table, which loadFonts would already have rejected. */
export function readMetrics(data: ArrayBuffer): FontMetrics {
  const dv = new DataView(data);
  const t = tables(dv);
  const head = t.get('head'), hhea = t.get('hhea'), hmtx = t.get('hmtx'), cmap = t.get('cmap');
  if (!head || !hhea || !hmtx) throw new Error('font is missing head/hhea/hmtx');

  const unitsPerEm = dv.getUint16(head.off + 18) || 1000;
  const numHMetrics = dv.getUint16(hhea.off + 34);
  const advances = new Uint16Array(Math.max(1, numHMetrics));
  for (let i = 0; i < numHMetrics; i++) {
    const o = hmtx.off + i * 4;
    advances[i] = o + 2 <= dv.byteLength ? dv.getUint16(o) : 0;
  }
  return {
    unitsPerEm,
    advances,
    cmap: cmap ? readCmap(dv, cmap.off) : new Map(),
    lastAdvance: advances[advances.length - 1] ?? unitsPerEm / 2,
  };
}

const cache = new WeakMap<ArrayBuffer, FontMetrics>();

/** Metrics are parsed once per font file and reused for every frame. */
export function metricsFor(data: ArrayBuffer): FontMetrics {
  let m = cache.get(data);
  if (!m) { m = readMetrics(data); cache.set(data, m); }
  return m;
}

export interface TextStyle {
  size: number;
  /** letter-spacing in em, as a taste profile states it */
  tracking?: number;
}

/** Width of a single line, in pixels. */
export function measureLine(text: string, m: FontMetrics, style: TextStyle): number {
  if (!text) return 0;
  const scale = style.size / m.unitsPerEm;
  let units = 0;
  let count = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    const gid = m.cmap.get(cp);
    const adv = gid === undefined ? m.lastAdvance : (m.advances[gid] ?? m.lastAdvance);
    units += adv;
    count++;
  }
  return units * scale + (style.tracking ?? 0) * style.size * Math.max(0, count - 1);
}

/** Split a word that cannot fit on a line of its own.
 *
 *  Shrinking alone cannot save a 46-character word: past a point the type is
 *  too small to read and it still does not fit. Breaking it is the lesser evil,
 *  and it is what a browser does with `overflow-wrap: anywhere`. Ordinary text
 *  never reaches here, because ordinary words fit. */
function breakWord(word: string, m: FontMetrics, style: TextStyle, maxWidth: number): string[] {
  const chars = [...word];
  const out: string[] = [];
  let chunk = '';
  for (const ch of chars) {
    const next = chunk + ch;
    if (chunk && measureLine(next, m, style) > maxWidth) { out.push(chunk); chunk = ch; }
    else chunk = next;
  }
  if (chunk) out.push(chunk);
  return out.length ? out : [word];
}

/** The tokens flexbox will lay out, with any unbreakable word already split.
 *  Measurement and rendering must agree on this, or the fitted size is a
 *  prediction about a layout that never happens. */
export function layoutTokens(text: string, m: FontMetrics, style: TextStyle, maxWidth: number): string[] {
  const out: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (measureLine(w, m, style) <= maxWidth) out.push(w);
    else out.push(...breakWord(w, m, style, maxWidth));
  }
  return out;
}

/** Greedy word wrap, matching how flexbox breaks a line of text. */
export function wrapLines(text: string, m: FontMetrics, style: TextStyle, maxWidth: number): string[] {
  const words = layoutTokens(text, m, style, maxWidth);
  if (!words.length) return [];
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && measureLine(next, m, style) > maxWidth) { lines.push(line); line = w; }
    else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export interface FitOpts {
  maxWidth: number;
  /** vertical room; omit when only width matters, as for a single-line stat */
  maxHeight?: number;
  lineHeight?: number;
  tracking?: number;
  /** Never shrink below this fraction of the requested size.
   *
   *  The floor is not there to prevent overflow — overflow is always worse than
   *  small type — it is there to stop the tool pretending it solved a scene
   *  that simply has too much text in it. Past the floor, `overflows` is set
   *  and the author gets told. */
  floor?: number;
  /** word-wrap, or keep it on one line */
  wrap?: boolean;
}

export interface FitResult {
  size: number;
  lines: string[];
  width: number;
  height: number;
  /** true when the text had to be shrunk to fit */
  shrunk: boolean;
  /** true when even the floor size overflows — the caller should warn */
  overflows: boolean;
}

/** Largest size at or below `size` that fits the box.
 *
 *  Steps down by 2% rather than binary searching: the search space is tiny, and
 *  a multiplicative walk lands on sizes that stay on the type scale instead of
 *  arriving at an arbitrary fraction of a pixel. */
export function fitText(text: string, m: FontMetrics, size: number, opts: FitOpts): FitResult {
  const { maxWidth, maxHeight, lineHeight = 1.2, tracking = 0, floor = 0.45, wrap = true } = opts;
  const minSize = size * floor;

  const STEP = 0.98;
  // enough steps to actually reach the floor: a fixed cap would quietly stop
  // shrinking early and report an overflow that more steps would have solved
  const maxSteps = Math.ceil(Math.log(floor) / Math.log(STEP)) + 2;

  let s = size;
  for (let i = 0; i <= maxSteps; i++) {
    const style = { size: s, tracking };
    const lines = wrap ? wrapLines(text, m, style, maxWidth) : [text];
    const width = Math.max(0, ...lines.map((l) => measureLine(l, m, style)));
    const height = lines.length * s * lineHeight;
    const fits = width <= maxWidth && (maxHeight === undefined || height <= maxHeight);
    if (fits || s <= minSize) {
      return { size: s, lines, width, height, shrunk: s < size - 0.01, overflows: !fits };
    }
    s = Math.max(minSize, s * STEP);
  }

  // the floor was reached without fitting; measure it rather than assuming
  const style = { size: minSize, tracking };
  const lines = wrap ? wrapLines(text, m, style, maxWidth) : [text];
  const width = Math.max(0, ...lines.map((l) => measureLine(l, m, style)));
  const height = lines.length * minSize * lineHeight;
  return {
    size: minSize, lines, width, height, shrunk: true,
    overflows: width > maxWidth || (maxHeight !== undefined && height > maxHeight),
  };
}
