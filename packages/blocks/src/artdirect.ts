/** Art direction: the things that make a frame look composed rather than filled.
 *
 *  Three problems this exists to solve, all visible in any early stingo frame:
 *
 *  1. Everything was centred on both axes. Dead space only reads as composition
 *     when it is *active* — asymmetric, with something holding the frame. Dead
 *     space around a centred block just reads as a slide.
 *  2. The ground was flat near-black. Flat black is the surest tell of a
 *     template; a real frame is lit, even when it is dark.
 *  3. Nothing acknowledged the edges. Motion graphics that look designed use
 *     the frame — rules bleeding off it, marks at its corners, a numeral set
 *     against it.
 *
 *  All of it is analytic SVG: gradients and lines, no filters. A full-frame
 *  `feGaussianBlur` costs about 9.5 seconds a frame, which is why the glow here
 *  is a radial gradient and not a blur.
 */
import { clamp, interpolate } from '@stingo/core';
import type { BlockCtx } from './ctx';
import { enterP } from './anim';
import type { Stage } from './stage';

export interface Rect { x: number; y: number; w: number; h: number }

/** Blocks that are mostly type, and can therefore be anchored off-centre.
 *  Structural blocks — code windows, charts, comparisons — need the whole
 *  frame and are left alone. */
const ANCHORED = new Set(['title', 'statement', 'quote', 'outro', 'stat', 'broll']);

/** Where a scene's content actually sits.
 *
 *  Returning null means "use the whole frame". For anchored blocks the content
 *  is pushed into a band low in portrait and left in landscape, which leaves
 *  the remaining space to be used rather than merely empty. The band still
 *  centres its own content, so no block needs to know this happened. */
export function compositionRect(block: string, s: Stage): Rect | null {
  if (!ANCHORED.has(block)) return null;

  if (s.orientation === 'landscape') {
    // left-anchored: the eye starts at the type and travels into open space
    const w = Math.round(s.w * 0.64);
    return { x: 0, y: 0, w, h: s.h };
  }
  // Portrait and square: a band below centre, the way a title card sits. The
  // band is kept tight — content centres inside it, so a tall band would float
  // the type in the middle of its own empty space and undo the point.
  const top = Math.round(s.h * (s.orientation === 'square' ? 0.42 : 0.53));
  const bottom = Math.round(s.h * 0.93);
  return { x: 0, y: top, w: s.w, h: bottom - top };
}

const hexA = (hex: string, a: number) => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16) || 0;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(3)})`;
};

/** Gradient definitions for the ground. Placed in <defs> once per frame. */
export function groundDefs(c: BlockCtx, seed: number): string {
  const { palette } = c.taste;
  // the wash drifts between scenes so consecutive frames are not identical
  const a = (seed * 37) % 100 / 100;
  const b = (seed * 61) % 100 / 100;
  return [
    `<radialGradient id="ad-warm" cx="${(18 + a * 30).toFixed(1)}%" cy="${(22 + b * 24).toFixed(1)}%" r="78%">`,
    `<stop offset="0%" stop-color="${palette.accent}" stop-opacity="0.16"/>`,
    `<stop offset="55%" stop-color="${palette.accent}" stop-opacity="0.04"/>`,
    `<stop offset="100%" stop-color="${palette.accent}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="ad-cool" cx="${(82 - a * 26).toFixed(1)}%" cy="${(78 - b * 20).toFixed(1)}%" r="70%">`,
    `<stop offset="0%" stop-color="${palette.accent2}" stop-opacity="0.10"/>`,
    `<stop offset="60%" stop-color="${palette.accent2}" stop-opacity="0.03"/>`,
    `<stop offset="100%" stop-color="${palette.accent2}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="ad-lift" x1="0%" y1="100%" x2="0%" y2="0%">`,
    `<stop offset="0%" stop-color="${palette.surface}" stop-opacity="0.55"/>`,
    `<stop offset="70%" stop-color="${palette.surface}" stop-opacity="0"/></linearGradient>`,
  ].join('');
}

/** The lit ground. Sits under the b-roll, over the flat background fill. */
export function groundLayer(c: BlockCtx): string {
  const { w, h } = c.stage;
  return `<rect width="${w}" height="${h}" fill="url(#ad-lift)"/>`
    + `<rect width="${w}" height="${h}" fill="url(#ad-warm)"/>`
    + `<rect width="${w}" height="${h}" fill="url(#ad-cool)"/>`;
}

/** The scene number, set large and barely above the background.
 *
 *  A film slate, a magazine folio, a chapter number — the same move everywhere,
 *  and the cheapest way to make a frame look like it belongs to a series. It
 *  goes in the space the anchored composition just freed up. */
function slate(c: BlockCtx, rect: Rect | null, opacity: number): string {
  // no anchored composition means no space was freed, and a full-width panel
  // would simply be drawn over the top of it
  if (!rect) return '';
  const { palette } = c.taste;
  const s = c.stage;
  const size = s.unit * (s.orientation === 'landscape' ? 7.5 : 9);
  const n = String(c.index + 1).padStart(2, '0');
  const p = clamp(enterP(c.t, c.taste, 0));

  // sit it in the freed space: above the band in portrait, right of it in landscape
  const x = s.orientation === 'landscape' ? (rect ? rect.x + rect.w + s.padX * 0.6 : s.w - s.padX - size * 1.2) : s.padX;
  const y = s.orientation === 'landscape'
    ? s.padY + size * 0.82
    : (rect ? rect.y - s.unit * 1.4 : s.padY + size);

  const dy = interpolate(p, [0, 1], [s.unit * 0.8, 0]);
  return `<text x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" `
    + `font-family="JetBrains Mono" font-size="${size.toFixed(1)}" font-weight="800" `
    + `letter-spacing="${(-size * 0.05).toFixed(1)}" `
    + `fill="${palette.text}" opacity="${(opacity * p).toFixed(3)}">${n}</text>`;
}

/** A hairline that bleeds off both edges, with an accent segment where the
 *  content column begins. It tells you where the type is anchored, and it is
 *  the single element doing most of the work of making the frame feel framed. */
function baseline(c: BlockCtx, rect: Rect | null, opacity: number): string {
  if (!rect) return '';
  const s = c.stage;
  const p = clamp(enterP(c.t, c.taste, 0));
  const { palette } = c.taste;
  const weight = Math.max(1.5, s.unit * 0.055);

  // the rule and its accent segment share one opacity: if the rule is too faint
  // to see, a visible accent segment is just a dash floating in space
  const rail = (opacity * 0.62).toFixed(3);
  const tick = (opacity * 1.5).toFixed(3);

  if (s.orientation === 'landscape') {
    const x = rect.x + rect.w;
    const y2 = interpolate(p, [0, 1], [s.h * 0.5, s.h]);
    return `<rect x="${x.toFixed(1)}" y="${(s.h - y2).toFixed(1)}" width="${weight}" height="${y2.toFixed(1)}" `
      + `fill="${palette.muted}" opacity="${rail}"/>`
      + `<rect x="${x.toFixed(1)}" y="${(s.padY).toFixed(1)}" width="${weight}" height="${(s.unit * 3 * p).toFixed(1)}" `
      + `fill="${palette.accent}" opacity="${tick}"/>`;
  }
  const y = rect.y;
  const w = interpolate(p, [0, 1], [s.w * 0.4, s.w]);
  return `<rect x="0" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${weight}" `
    + `fill="${palette.muted}" opacity="${rail}"/>`
    + `<rect x="${s.padX.toFixed(1)}" y="${y.toFixed(1)}" width="${(s.unit * 2.6 * p).toFixed(1)}" height="${weight}" `
    + `fill="${palette.accent}" opacity="${tick}"/>`;
}

/** Crop marks at the corners of the safe area. Borrowed from print, and the
 *  reason a frame reads as deliberately cropped rather than accidentally sized. */
function cornerMarks(c: BlockCtx, opacity: number): string {
  const s = c.stage;
  const { palette } = c.taste;
  const len = s.unit * 1.1;
  const t = Math.max(1.5, s.unit * 0.045);
  const inset = { x: s.padX * 0.55, y: s.padY * 0.42 };
  const p = clamp(enterP(c.t, c.taste, 0.1));
  const o = (opacity * p).toFixed(3);
  const L = len * p;
  const corner = (cx: number, cy: number, sx: number, sy: number) =>
    `<rect x="${(cx - (sx < 0 ? L : 0)).toFixed(1)}" y="${cy.toFixed(1)}" width="${L.toFixed(1)}" height="${t}" fill="${palette.muted}" opacity="${o}"/>`
    + `<rect x="${cx.toFixed(1)}" y="${(cy - (sy < 0 ? L : 0)).toFixed(1)}" width="${t}" height="${L.toFixed(1)}" fill="${palette.muted}" opacity="${o}"/>`;

  return corner(inset.x, inset.y, 1, 1)
    + corner(s.w - inset.x - t, inset.y, -1, 1)
    + corner(inset.x, s.h - inset.y - t, 1, -1)
    + corner(s.w - inset.x - t, s.h - inset.y - t, -1, -1);
}

/** Everything that draws over the b-roll but under the block's own content.
 *  Amounts follow the taste's texture: a "clean" profile gets a whisper of it,
 *  "crt" gets the lot. No new schema field — the intent is already stated. */
export function furnitureLayer(c: BlockCtx, rect: Rect | null): string {
  const tex = c.taste.texture;
  const strength = clamp(0.62 + tex.grid * 2.2, 0.55, 1);
  return baseline(c, rect, 0.55 * strength)
    + slate(c, rect, 0.075 + tex.grid * 0.3)
    + cornerMarks(c, 0.30 * strength);
}
