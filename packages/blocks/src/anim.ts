import { interpolate, clamp, spring, ease, PERSONALITY_EASE } from '@stingo/core';
import type { TasteProfile } from '@stingo/schema';

export type AnimKind = 'fade'|'rise'|'fall'|'pop'|'slideL'|'slideR'|'wipe'|'typewriter'|'blur'|'none';

export interface AnimStyle { opacity?: number; transform?: string }

/** Resolve the curve for a taste profile: explicit ease wins, else personality. */
export function tasteEase(taste: TasteProfile): string {
  return taste.motion.ease || PERSONALITY_EASE[taste.motion.personality] || 'expo.out';
}

/** Progress 0..1 for an element entering at `delay` within a scene at local time t. */
export function enterP(t: number, taste: TasteProfile, delay = 0, dur?: number): number {
  const d = dur ?? taste.motion.enter;
  const e = tasteEase(taste);
  if (e === 'spring') return clamp(spring(Math.max(0, t - delay), taste.motion.spring));
  return interpolate(t, [delay, delay + d], [0, 1], { ease: e });
}

/** Progress 1..0 for an element leaving in the last `exit` seconds of a scene. */
export function exitP(t: number, sceneDur: number, taste: TasteProfile): number {
  const d = taste.motion.exit;
  return interpolate(t, [sceneDur - d, sceneDur], [1, 0], { ease: 'quad.in' });
}

/** Turn progress into satori-safe style. Satori supports transform + opacity,
 *  but not filter:blur — 'blur' degrades to a scale/fade, which reads similarly. */
export function animStyle(kind: AnimKind, p: number, taste: TasteProfile, dir = 1): AnimStyle {
  const travel = taste.motion.travel;
  const q = clamp(p);
  switch (kind) {
    case 'none': return {};
    case 'fade': return { opacity: q };
    case 'rise': return { opacity: q, transform: `translateY(${((1 - q) * travel * dir).toFixed(2)}px)` };
    case 'fall': return { opacity: q, transform: `translateY(${(-(1 - q) * travel * dir).toFixed(2)}px)` };
    case 'slideL': return { opacity: q, transform: `translateX(${((1 - q) * travel * 1.8).toFixed(2)}px)` };
    case 'slideR': return { opacity: q, transform: `translateX(${(-(1 - q) * travel * 1.8).toFixed(2)}px)` };
    case 'pop': {
      const s = 0.86 + q * 0.14;
      return { opacity: clamp(q * 1.6), transform: `scale(${s.toFixed(3)})` };
    }
    case 'blur': return { opacity: q, transform: `scale(${(1.04 - q * 0.04).toFixed(3)})` };
    case 'wipe': return { opacity: q > 0 ? 1 : 0 };
    case 'typewriter': return { opacity: 1 };
    default: return { opacity: q };
  }
}

/** How many characters of `text` are visible at progress p — for typewriter reveals. */
export const typed = (text: string, p: number) => text.slice(0, Math.round(clamp(p) * text.length));

/** Combined enter+exit style for an element inside a scene. */
export function lifecycle(t: number, sceneDur: number, taste: TasteProfile, kind: AnimKind, delay = 0, dur?: number): AnimStyle {
  const inS = animStyle(kind, enterP(t, taste, delay, dur), taste);
  const out = exitP(t, sceneDur, taste);
  return { ...inS, opacity: (inS.opacity ?? 1) * out };
}
