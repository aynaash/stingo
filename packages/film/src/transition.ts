import { clamp, interpolate, ease, rng } from '@stingo/core';
import type { Palette } from '@stingo/schema';

/** Scene-to-scene transitions.
 *
 *  stingo renders one scene per frame, so a true crossfade — two scenes alive
 *  at once — would double the cost of every boundary. Each of these instead
 *  splits the move in half: the outgoing scene plays the first half over its
 *  last `duration` seconds, the incoming scene plays the second half over its
 *  first. Both halves push the same way, so the pair reads as one gesture.
 *
 *  `wipe`, `whip`, `glitch` and `slide` were in the taste schema for a long
 *  time and rendered as plain cuts, which is worse than not offering them. */

export type TransitionKind = 'cut' | 'fade' | 'wipe' | 'whip' | 'glitch' | 'slide';

export interface TransitionFrame {
  /** transform applied to the scene's content */
  transform?: string;
  /** multiplies the content's opacity */
  opacity?: number;
  /** SVG drawn in front of the frame */
  overlay?: string;
  /** effects SVG cannot express, applied to the rasterised pixels */
  pixel?: (px: Buffer, w: number, h: number) => void;
}

export interface TransitionCtx {
  kind: TransitionKind;
  /** seconds into the scene */
  local: number;
  /** how long this scene runs */
  sceneDur: number;
  /** half-length of the move, from the taste profile */
  duration: number;
  /** the first scene has nothing to enter from, the last nothing to leave to */
  isFirst: boolean;
  isLast: boolean;
  index: number;
  w: number;
  h: number;
  palette: Palette;
}

const EMPTY: TransitionFrame = {};

/** 0 at rest, 1 at the boundary — the shape both halves share. */
function phase(c: TransitionCtx): { enter: number; exit: number } {
  const d = Math.min(c.duration, c.sceneDur / 2);
  if (d <= 0) return { enter: 0, exit: 0 };
  return {
    enter: c.isFirst ? 0 : clamp(interpolate(c.local, [0, d], [1, 0])),
    exit: c.isLast ? 0 : clamp(interpolate(c.local, [c.sceneDur - d, c.sceneDur], [0, 1])),
  };
}

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;

/** Everything moves the same way — leftward — so a scene leaving and the next
 *  arriving read as one push rather than two unrelated slides. */
function slide(c: TransitionCtx, { enter, exit }: { enter: number; exit: number }, distance: number): TransitionFrame {
  if (enter <= 0 && exit <= 0) return EMPTY;
  const outEase = ease('expo.in'), inEase = ease('expo.out');
  // enter counts down from 1, so 1-enter is how far in it has come
  const x = exit > 0 ? -outEase(exit) * distance : inEase(1 - enter) * distance - distance;
  return { transform: `translateX(${pct(x)})` };
}

function wipe(c: TransitionCtx, { enter, exit }: { enter: number; exit: number }): TransitionFrame {
  const amt = exit > 0 ? exit : enter > 0 ? enter : 0;
  if (amt <= 0.001) return EMPTY;
  const e = ease('cubic.inOut')(amt);
  // covering on the way out, retreating on the way in — both left to right
  const x = exit > 0 ? 0 : c.w * (1 - e);
  const bw = exit > 0 ? c.w * e : c.w * e;
  if (bw <= 0.5) return EMPTY;
  const edge = exit > 0 ? bw : x;
  return {
    overlay:
      `<rect x="${x.toFixed(1)}" y="0" width="${bw.toFixed(1)}" height="${c.h}" fill="${c.palette.bg}"/>` +
      `<rect x="${(edge - 3).toFixed(1)}" y="0" width="3" height="${c.h}" fill="${c.palette.accent}" opacity="0.9"/>`,
  };
}

/** A whip pan is motion blur. Satori has no blur and a full-frame SVG blur costs
 *  seconds per frame, so the smear is drawn: the content travels further and
 *  faster than a slide, under a directional streak that peaks at the cut. */
function whip(c: TransitionCtx, p: { enter: number; exit: number }): TransitionFrame {
  const base = slide(c, p, 1.3);
  const amt = Math.max(p.enter, p.exit);
  if (amt <= 0.001) return base;
  const streak = ease('quad.out')(amt) * 0.85;
  const id = `whipStreak${c.index}`;
  return {
    ...base,
    overlay:
      `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="${c.palette.bg}" stop-opacity="${streak.toFixed(3)}"/>` +
      `<stop offset="0.5" stop-color="${c.palette.bg}" stop-opacity="${(streak * 0.35).toFixed(3)}"/>` +
      `<stop offset="1" stop-color="${c.palette.bg}" stop-opacity="${streak.toFixed(3)}"/>` +
      `</linearGradient></defs>` +
      `<rect width="${c.w}" height="${c.h}" fill="url(#${id})"/>`,
  };
}

/** Channel split and torn horizontal bands, applied to pixels.
 *  Seeded from the scene index and the frame, so it is deterministic: the same
 *  frame glitches identically on any worker, which parallel rendering needs. */
function glitchPixels(amount: number, seed: number) {
  return (px: Buffer, w: number, h: number) => {
    const shift = Math.round(amount * w * 0.018);
    const bands = Math.round(amount * 7);
    if (shift < 1 && bands < 1) return;
    const row = Buffer.allocUnsafe(w * 4);

    // red left, blue right — the familiar chromatic tear
    if (shift >= 1) {
      for (let y = 0; y < h; y++) {
        const base = y * w * 4;
        px.copy(row, 0, base, base + w * 4);
        for (let x = 0; x < w; x++) {
          const i = base + x * 4;
          const r = Math.min(w - 1, x + shift), b = Math.max(0, x - shift);
          px[i] = row[r * 4]!;
          px[i + 2] = row[b * 4 + 2]!;
        }
      }
    }

    // a few bands slid sideways, as if the signal dropped
    const r = rng(seed);
    for (let n = 0; n < bands; n++) {
      const y0 = Math.floor(r() * h);
      const bh = Math.max(2, Math.floor(r() * h * 0.035));
      const dx = Math.round((r() * 2 - 1) * amount * w * 0.07);
      if (dx === 0) continue;
      for (let y = y0; y < Math.min(h, y0 + bh); y++) {
        const base = y * w * 4;
        px.copy(row, 0, base, base + w * 4);
        for (let x = 0; x < w; x++) {
          const src = Math.min(w - 1, Math.max(0, x - dx));
          px.copy(row.subarray(src * 4, src * 4 + 4), base + x * 4);
        }
      }
    }
  };
}

function glitch(c: TransitionCtx, { enter, exit }: { enter: number; exit: number }): TransitionFrame {
  const amt = Math.max(enter, exit);
  if (amt <= 0.02) return EMPTY;
  const e = ease('quad.in')(amt);
  return {
    pixel: glitchPixels(e, c.index * 9973 + Math.round(c.local * 1000)),
    opacity: 1 - e * 0.12,
  };
}

function fade(c: TransitionCtx, { enter, exit }: { enter: number; exit: number }): TransitionFrame {
  // element-level enter/exit already carries the cut; this is seasoning on top,
  // so it stays well short of a blackout
  const amt = clamp(Math.max(enter, exit)) * 0.42;
  if (amt <= 0.002) return EMPTY;
  return { overlay: `<rect width="${c.w}" height="${c.h}" fill="${c.palette.bg}" opacity="${amt.toFixed(3)}"/>` };
}

export function transitionFrame(c: TransitionCtx): TransitionFrame {
  if (c.kind === 'cut' || c.duration <= 0) return EMPTY;
  const p = phase(c);
  if (p.enter <= 0 && p.exit <= 0) return EMPTY;
  switch (c.kind) {
    case 'fade': return fade(c, p);
    case 'wipe': return wipe(c, p);
    case 'whip': return whip(c, p);
    case 'slide': return slide(c, p, 1);
    case 'glitch': return glitch(c, p);
    default: return EMPTY;
  }
}
