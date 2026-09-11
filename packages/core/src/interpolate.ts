import { ease, type Easing } from './easing';

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const inv = (a: number, b: number, v: number) => (b === a ? 0 : (v - a) / (b - a));

export interface InterpOpts { ease?: string | Easing; clamp?: boolean }

/** interpolate(t, [inMin,inMax], [outMin,outMax]) — also accepts multi-stop ranges. */
export function interpolate(t: number, input: number[], output: number[], opts: InterpOpts = {}): number {
  if (input.length !== output.length || input.length < 2) throw new Error('interpolate: input/output must pair and have >= 2 stops');
  const doClamp = opts.clamp ?? true;
  const fn = ease(opts.ease, 'linear');
  if (doClamp) {
    if (t <= input[0]!) return output[0]!;
    if (t >= input[input.length - 1]!) return output[output.length - 1]!;
  }
  let i = 0;
  while (i < input.length - 2 && t >= input[i + 1]!) i++;
  const p = inv(input[i]!, input[i + 1]!, t);
  return lerp(output[i]!, output[i + 1]!, fn(doClamp ? clamp(p) : p));
}

/** Deterministic, closed-form damped spring. No simulation state, so it stays seekable. */
export interface SpringCfg { stiffness?: number; damping?: number; mass?: number }
export function spring(t: number, cfg: SpringCfg = {}): number {
  const k = cfg.stiffness ?? 170, c = cfg.damping ?? 18, m = cfg.mass ?? 1;
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (zeta < 1) {
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
  }
  return 1 - Math.exp(-w0 * t) * (1 + w0 * t); // critically / over damped
}

/** Seconds until a spring is visually settled — used to size scene durations. */
export function springDuration(cfg: SpringCfg = {}, eps = 0.001): number {
  for (let t = 0; t < 6; t += 1 / 120) if (Math.abs(1 - spring(t, cfg)) < eps) return t;
  return 6;
}

/** Seeded PRNG (mulberry32). Determinism matters: same seed, same frames, always. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Staggered progress for the i-th sibling of n. */
export function stagger(t: number, i: number, gap: number, dur: number, e?: string | Easing): number {
  return interpolate(t, [i * gap, i * gap + dur], [0, 1], { ease: e ?? 'expo.out' });
}
