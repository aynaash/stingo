import type { VideoDoc, TasteProfile } from '@stingo/schema';

/** Safe-area guides drawn over a still.
 *
 *  Every platform puts its own furniture on top of your video — a caption and a
 *  handle along the bottom, a column of buttons up the right edge, a duration
 *  pill in a corner. None of it is in the frame you rendered, so a headline
 *  parked under the Shorts right rail looks fine in `still` and is unreadable
 *  in the app. By the time you find out, the thing is published.
 *
 *  The numbers are fractions of the frame rather than pixels, so the same zones
 *  hold at any canvas size. They are deliberately generous: a guide that is
 *  slightly too cautious costs you nothing, and one that is slightly too
 *  optimistic costs you the post. */

export interface Zone {
  /** fractions of the frame, 0..1 */
  x: number; y: number; w: number; h: number;
  label: string;
}

/** Title-safe: the classic 90% box. Anything you actually want read lives here. */
const TITLE_SAFE = 0.9;
/** Action-safe: the 95% box. Backgrounds and furniture may cross it. */
const ACTION_SAFE = 0.95;

/** Where the platforms put their own interface, by frame shape.
 *
 *  Portrait is the crowded one, and the numbers are the union of what Shorts,
 *  Reels and TikTok claim rather than any single app's — a script cut for all
 *  three has to clear all three. */
const ZONES: Record<'portrait' | 'landscape' | 'square', Zone[]> = {
  portrait: [
    { x: 0.82, y: 0.30, w: 0.18, h: 0.52, label: 'actions rail' },
    { x: 0, y: 0.80, w: 0.86, h: 0.20, label: 'caption + handle' },
    { x: 0, y: 0, w: 1, h: 0.06, label: 'status bar' },
  ],
  landscape: [
    { x: 0, y: 0.88, w: 1, h: 0.12, label: 'player controls' },
    { x: 0.80, y: 0.80, w: 0.20, h: 0.08, label: 'end card' },
  ],
  square: [
    { x: 0, y: 0.86, w: 1, h: 0.14, label: 'caption + actions' },
  ],
};

export interface GuideOpts {
  /** dim the zones as well as outlining them */
  fill?: boolean;
}

/** An SVG fragment to composite over a rendered frame.
 *
 *  This is an overlay, not part of the film: nothing here is ever encoded into
 *  a video, and `still --guides` is the only caller. */
export function guidesSvg(doc: VideoDoc, taste: TasteProfile, opts: GuideOpts = {}): string {
  const { width: w, height: h, orientation } = doc.canvas;
  const zones = ZONES[orientation] ?? ZONES.portrait;
  const ink = taste.palette.warn;
  const danger = taste.palette.danger;
  const type = Math.max(11, Math.round(Math.min(w, h) * 0.016));
  const parts: string[] = [];

  const safeBox = (frac: number, dash: string, label: string) => {
    const bw = w * frac, bh = h * frac;
    const x = (w - bw) / 2, y = (h - bh) / 2;
    parts.push(
      `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}"`
      + ` fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="${dash}" opacity="0.75"/>`
      + `<text x="${(x + 8).toFixed(1)}" y="${(y + type * 1.2).toFixed(1)}" fill="${ink}"`
      + ` font-family="JetBrains Mono" font-size="${type}" opacity="0.85">${label}</text>`,
    );
  };

  safeBox(ACTION_SAFE, '2 6', `action-safe ${Math.round(ACTION_SAFE * 100)}%`);
  safeBox(TITLE_SAFE, '10 6', `title-safe ${Math.round(TITLE_SAFE * 100)}%`);

  for (const z of zones) {
    const zx = z.x * w, zy = z.y * h, zw = z.w * w, zh = z.h * h;
    if (opts.fill !== false) {
      // light enough that the composition underneath is still judgeable — the
      // point is to see whether your type clears the zone, which you cannot do
      // through a wash
      parts.push(`<rect x="${zx.toFixed(1)}" y="${zy.toFixed(1)}" width="${zw.toFixed(1)}" height="${zh.toFixed(1)}"`
        + ` fill="${danger}" opacity="0.09"/>`);
    }
    // labels are set in a monospace face, so their width is known exactly; one
    // that would run past the zone is right-aligned inside it instead
    const labelW = z.label.length * type * 0.6;
    const fits = zx + 8 + labelW <= Math.min(w, zx + zw);
    const anchor = fits ? '' : ' text-anchor="end"';
    const lx = fits ? zx + 8 : Math.min(w - 8, zx + zw - 8);
    parts.push(
      `<rect x="${zx.toFixed(1)}" y="${zy.toFixed(1)}" width="${zw.toFixed(1)}" height="${zh.toFixed(1)}"`
      + ` fill="none" stroke="${danger}" stroke-width="2" stroke-dasharray="6 5" opacity="0.8"/>`
      + `<text x="${lx.toFixed(1)}" y="${(zy + type * 1.3).toFixed(1)}" fill="${danger}"`
      + `${anchor} font-family="JetBrains Mono" font-size="${type}">${esc(z.label)}</text>`,
    );
  }

  // centre cross, for judging whether a composition is actually centred
  parts.push(
    `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="${ink}" stroke-width="1" opacity="0.25"/>`
    + `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${ink}" stroke-width="1" opacity="0.25"/>`,
  );

  return `<g>${parts.join('')}</g>`;
}

/** The zones that apply to a canvas, for anything that wants to reason about
 *  them rather than draw them. */
export const guideZones = (doc: VideoDoc): Zone[] => ZONES[doc.canvas.orientation] ?? ZONES.portrait;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
