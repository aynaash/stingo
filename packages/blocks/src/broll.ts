import { rng, interpolate, clamp } from '@stingo/core';
import { grainPattern } from './grain';
import type { Broll, Palette } from '@stingo/schema';

export interface BrollCtx { w: number; h: number; palette: Palette; cfg: Broll; dur: number }

const esc = (n: number) => Number(n.toFixed(3));
/** Hand-written SVG is raw XML: any text content must be escaped. */
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const a = (hex: string, alpha: number) => {
  const v = hex.replace('#', '');
  const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v.slice(0, 6);
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp(alpha, 0, 1).toFixed(3)})`;
};

type Gen = (t: number, c: BrollCtx) => string;

/** Perspective grid receding to a horizon — the "dev channel" staple. */
const grid: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent;
  const step = 110 / cfg.density;
  const scroll = (t * 26 * cfg.speed) % step;
  const out: string[] = [];
  for (let x = -step; x <= w + step; x += step) out.push(`<line x1="${esc(x)}" y1="0" x2="${esc(x)}" y2="${h}" />`);
  for (let y = -step + scroll; y <= h + step; y += step) out.push(`<line x1="0" y1="${esc(y)}" x2="${w}" y2="${esc(y)}" />`);
  // the fade only covers the lower half: a full-frame gradient costs ~60ms to rasterise
  return `<g stroke="${a(col, 0.5 * cfg.opacity)}" stroke-width="1.25">${out.join('')}</g>
    <rect y="${esc(h * 0.45)}" width="${w}" height="${esc(h * 0.55)}" fill="url(#brollFade)"/>`;
};

/** Dot matrix with a travelling wave of brightness. */
const dots: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent2;
  const step = 74 / cfg.density;
  const out: string[] = [];
  for (let y = step / 2; y < h; y += step) {
    for (let x = step / 2; x < w; x += step) {
      const d = Math.hypot(x - w / 2, y - h * 0.42) / Math.max(w, h);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.2 * cfg.speed - d * 11);
      const r = 1.6 + pulse * 2.6;
      out.push(`<circle cx="${esc(x)}" cy="${esc(y)}" r="${esc(r)}" opacity="${esc(0.25 + pulse * 0.6)}"/>`);
    }
  }
  return `<g fill="${a(col, cfg.opacity)}">${out.join('')}</g>`;
};

/** Drifting particles with parallax depth. */
const particles: Gen = (t, { w, h, palette, cfg }) => {
  const r0 = rng(cfg.seed);
  const n = Math.round(70 * cfg.density);
  const col = cfg.color ?? palette.accent;
  const col2 = cfg.color2 ?? palette.accent2;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const depth = r0(), sx = r0(), sy = r0(), sp = 0.3 + r0() * 1.4, ph = r0() * 100;
    const y = (sy * h + t * sp * 34 * cfg.speed) % (h + 120) - 60;
    const x = sx * w + Math.sin(t * 0.6 * cfg.speed + ph) * (10 + depth * 42);
    const rad = 1.2 + depth * 4.4;
    out.push(`<circle cx="${esc(x)}" cy="${esc(y)}" r="${esc(rad)}" fill="${a(i % 5 === 0 ? col2 : col, (0.18 + depth * 0.55) * cfg.opacity)}"/>`);
  }
  return `<g>${out.join('')}</g>`;
};

/** Stacked sine waves — calm, good under talking sections. */
const waves: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent;
  const col2 = cfg.color2 ?? palette.accent2;
  const layers = Math.max(2, Math.round(5 * cfg.density));
  const out: string[] = [];
  for (let L = 0; L < layers; L++) {
    const amp = 28 + L * 20, yBase = h * (0.3 + L * 0.11), k = 0.0042 + L * 0.0011;
    const ph = t * (0.7 + L * 0.22) * cfg.speed;
    let d = `M -40 ${esc(yBase)}`;
    for (let x = -40; x <= w + 40; x += 24) d += ` L ${esc(x)} ${esc(yBase + Math.sin(x * k + ph) * amp)}`;
    out.push(`<path d="${d}" fill="none" stroke="${a(L % 2 ? col2 : col, (0.5 - L * 0.07) * cfg.opacity)}" stroke-width="${esc(2.6 - L * 0.3)}"/>`);
  }
  return `<g>${out.join('')}</g>`;
};

/** Falling glyph columns. Reads as "code" without being readable. */
const codeRain: Gen = (t, { w, h, palette, cfg }) => {
  const r0 = rng(cfg.seed);
  const cols = Math.round((w / 46) * cfg.density);
  const col = cfg.color ?? palette.accent2;
  const glyphs = '01{}[]()<>/\\|;:=+-*&%$#@!?abcdefxyzΔΣλ';
  const out: string[] = [];
  for (let c = 0; c < cols; c++) {
    const x = (c + 0.5) * (w / cols);
    const sp = 55 + r0() * 150, off = r0() * h, len = 6 + Math.floor(r0() * 10);
    const head = (off + t * sp * cfg.speed) % (h + 400) - 200;
    for (let i = 0; i < len; i++) {
      const y = head - i * 34;
      if (y < -40 || y > h + 40) continue;
      const g = glyphs[Math.floor(r0() * glyphs.length)] ?? '0';
      const op = (1 - i / len) * cfg.opacity;
      out.push(`<text x="${esc(x)}" y="${esc(y)}" font-size="26" font-family="JetBrains Mono" fill="${a(i === 0 ? palette.text : col, op)}">${xml(g)}</text>`);
    }
  }
  return `<g>${out.join('')}</g>`;
};

/** Rotating light beams from a point — energy under big statements. */
const beams: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent;
  const n = Math.round(7 * cfg.density), cx = w / 2, cy = h * 0.38, R = Math.hypot(w, h);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + t * 0.16 * cfg.speed;
    const spread = 0.055;
    const p = (A: number) => `${esc(cx + Math.cos(A) * R)},${esc(cy + Math.sin(A) * R)}`;
    out.push(`<polygon points="${cx},${cy} ${p(ang - spread)} ${p(ang + spread)}" fill="url(#beamFade)" opacity="${esc(0.5 * cfg.opacity)}"/>`);
  }
  return `<g>${out.join('')}</g>
    <circle cx="${esc(cx)}" cy="${esc(cy)}" r="${esc(Math.max(w, h) * 0.34)}" fill="url(#beamCore)" opacity="${esc(0.7 * cfg.opacity)}"/>`;
};

/** Concentric rings pulsing outward — lands hard on a beat. */
const pulse: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent2;
  const cx = w / 2, cy = h * 0.42, n = Math.round(5 * cfg.density), period = 2.6 / cfg.speed;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const ph = ((t + (i * period) / n) % period) / period;
    const r = ph * Math.max(w, h) * 0.62;
    out.push(`<circle cx="${cx}" cy="${esc(cy)}" r="${esc(r)}" fill="none" stroke="${a(col, (1 - ph) * 0.55 * cfg.opacity)}" stroke-width="${esc(3 - ph * 2)}"/>`);
  }
  return `<g>${out.join('')}</g>`;
};

/** Orbiting bodies — good under "system"/"architecture" talk. */
const orbits: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent, col2 = cfg.color2 ?? palette.accent2;
  const cx = w / 2, cy = h * 0.42, n = Math.round(4 * cfg.density);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const R = 130 + i * 118, sp = (0.5 - i * 0.08) * cfg.speed, ang = t * sp + i * 1.3;
    out.push(`<ellipse cx="${cx}" cy="${esc(cy)}" rx="${esc(R)}" ry="${esc(R * 0.42)}" fill="none" stroke="${a(col, 0.22 * cfg.opacity)}" stroke-width="1.5"/>`);
    out.push(`<circle cx="${esc(cx + Math.cos(ang) * R)}" cy="${esc(cy + Math.sin(ang) * R * 0.42)}" r="${esc(7 + i * 2)}" fill="${a(i % 2 ? col2 : col, 0.9 * cfg.opacity)}"/>`);
  }
  return `<g>${out.join('')}</g>`;
};

/** Soft colour field. The quietest option — use under dense text. */
const mesh: Gen = (t, { w, h, palette, cfg }) => {
  const col = cfg.color ?? palette.accent, col2 = cfg.color2 ?? palette.accent2;
  const blobs = [
    { x: 0.25 + Math.sin(t * 0.21 * cfg.speed) * 0.16, y: 0.3 + Math.cos(t * 0.17 * cfg.speed) * 0.14, c: col, r: 0.55 },
    { x: 0.75 + Math.cos(t * 0.19 * cfg.speed) * 0.14, y: 0.62 + Math.sin(t * 0.23 * cfg.speed) * 0.16, c: col2, r: 0.48 },
    { x: 0.5 + Math.sin(t * 0.13 * cfg.speed + 2) * 0.2, y: 0.85, c: col, r: 0.4 },
  ];
  return `<g>${blobs.map((b, i) =>
    `<circle cx="${esc(b.x * w)}" cy="${esc(b.y * h)}" r="${esc(b.r * Math.min(w, h))}" fill="url(#softBlob${i % 2})" opacity="${esc(0.85 * cfg.opacity)}"/>`).join('')}</g>`;
};

/** Angular mountain silhouettes with parallax. */
const terrain: Gen = (t, { w, h, palette, cfg }) => {
  const out: string[] = [];
  for (let L = 0; L < 3; L++) {
    const r0 = rng(cfg.seed + L * 17);
    const base = h * (0.62 + L * 0.13), amp = 190 - L * 48, seg = 150 + L * 40;
    const shift = -(t * (8 + L * 12) * cfg.speed) % seg;
    let d = `M ${esc(shift - seg)} ${h}`;
    for (let x = shift - seg; x <= w + seg; x += seg) d += ` L ${esc(x + seg / 2)} ${esc(base - r0() * amp)} L ${esc(x + seg)} ${esc(base - r0() * amp * 0.5)}`;
    d += ` L ${esc(w + seg)} ${h} Z`;
    out.push(`<path d="${d}" fill="${a(L === 0 ? palette.accent : palette.surfaceAlt, (0.3 - L * 0.06) * cfg.opacity)}"/>`);
  }
  return `<g>${out.join('')}</g>`;
};

const noise: Gen = (_t, { w, h, palette, cfg }) =>
  `<rect width="${w}" height="${h}" fill="${a(palette.accent, 0.12 * cfg.opacity)}"/>
   <rect width="${w}" height="${h}" fill="url(#brollGrain)" opacity="${esc(0.45 * cfg.opacity)}"/>`;

const none: Gen = () => '';

export const GENERATORS: Record<Broll['kind'], Gen> = {
  none, grid, dots, particles, waves, codeRain, beams, pulse, orbits, mesh, terrain, noise,
};

/** Shared defs every generator may reference. Emitted once per frame. */
export function brollDefs(palette: Palette, w: number, h: number): string {
  return `
    <linearGradient id="brollFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${palette.bg}" stop-opacity="0"/>
      <stop offset="1" stop-color="${palette.bg}" stop-opacity="0.9"/>
    </linearGradient>
    <filter id="brollBlur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/></filter>
    <filter id="brollBlurBig" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) * 0.09)}"/></filter>
    <filter id="brollNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="4" seed="7" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0" result="g"/>
      <feComponentTransfer in="g"><feFuncA type="linear" slope="0.5" intercept="-0.15"/></feComponentTransfer>
    </filter>`;
}

/** Render the b-roll layer for time t, including its slow drift (Ken Burns). */
export function renderBroll(t: number, ctx: BrollCtx): string {
  const gen = GENERATORS[ctx.cfg.kind] ?? none;
  const inner = gen(t, ctx);
  if (!inner) return '';
  const p = ctx.dur > 0 ? clamp(t / ctx.dur) : 0;
  const scale = 1 + ctx.cfg.drift * p;
  const tx = (ctx.w * (1 - scale)) / 2, ty = (ctx.h * (1 - scale)) / 2;
  return `<g transform="translate(${esc(tx)} ${esc(ty)}) scale(${esc(scale)})">${inner}</g>`;
}
