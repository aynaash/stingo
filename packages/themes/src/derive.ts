import { TasteProfile } from '@stingo/schema';
import { HOUSE, type Density, type Mood, type TextureName } from './house';
import { atLightness, rotateHue, fromLCh, hexToOklab, oklabToHex, hue, contrast, ensureContrast } from './color';

/** What a user actually wants to declare. Everything else stingo derives. */
export interface TasteSeed {
  id: string;
  name?: string;
  /** the one colour the whole palette is built from */
  brand: string;
  /** optional second hue; derived by rotation when absent */
  support?: string;
  mode?: 'dark' | 'light';
  mood?: Mood;
  density?: Density;
  texture?: TextureName;
  fonts?: { display?: string; body?: string; mono?: string };
  /** base type size multiplier */
  scale?: number;
  cutOn?: 'free' | 'beat' | 'bar';
  cornerRadius?: number;
  wordsPerMinute?: number;
}

export interface DeriveResult { taste: TasteProfile; notes: string[] }

const neutral = (brandHex: string, L: number, C: number) =>
  oklabToHex(fromLCh(L, C, hue(hexToOklab(brandHex))));

const atHue = (deg: number, L: number, C: number) => oklabToHex(fromLCh(L, C, (deg * Math.PI) / 180));

/** Build a complete, contrast-checked taste profile from a handful of choices. */
export function derive(seed: TasteSeed): DeriveResult {
  const notes: string[] = [];
  const mode = seed.mode ?? 'dark';
  const mood = seed.mood ?? 'snappy';
  const density = seed.density ?? 'normal';
  const textureName = seed.texture ?? 'film';

  const ramp = HOUSE.ramp[mode];
  const nc = HOUSE.neutralChroma;

  // neutrals carry a trace of the brand hue so the palette reads as one family
  const bg = neutral(seed.brand, ramp.bg, nc.bg);
  const surface = neutral(seed.brand, ramp.surface, nc.surface);
  const surfaceAlt = neutral(seed.brand, ramp.surfaceAlt, nc.surfaceAlt);
  const border = neutral(seed.brand, ramp.border, nc.border);

  // normalise the brand to the house accent weight so any hue lands with equal punch
  const brandLab = hexToOklab(seed.brand);
  let accent = oklabToHex(fromLCh(HOUSE.accent.L, HOUSE.accent.C, hue(brandLab)));
  let accent2 = seed.support
    ? oklabToHex(fromLCh(HOUSE.support.L, HOUSE.support.C, hue(hexToOklab(seed.support))))
    : rotateHue(accent, HOUSE.support.hueShift);
  accent2 = oklabToHex(fromLCh(HOUSE.support.L, HOUSE.support.C, hue(hexToOklab(accent2))));

  let text = neutral(seed.brand, ramp.text, nc.text);
  let muted = neutral(seed.brand, ramp.muted, nc.muted);

  // enforce the readability floors, and say so when something had to move
  const fix = (label: string, hex: string, floor: number) => {
    const r = ensureContrast(hex, bg, floor);
    if (r.adjusted) notes.push(`${label} lifted from ${r.from.toFixed(1)}:1 to ${r.to.toFixed(1)}:1 against the background`);
    return r.hex;
  };
  text = fix('text', text, HOUSE.contrast.body);
  muted = fix('muted', muted, HOUSE.contrast.muted);
  accent = fix('accent', accent, HOUSE.contrast.accent);
  accent2 = fix('accent2', accent2, HOUSE.contrast.accent);

  const semL = mode === 'dark' ? 0.76 : 0.52;
  const ok = fix('ok', atHue(HOUSE.semantic.ok, semL, 0.14), HOUSE.contrast.accent);
  const warn = fix('warn', atHue(HOUSE.semantic.warn, semL + 0.06, 0.15), HOUSE.contrast.accent);
  const danger = fix('danger', atHue(HOUSE.semantic.danger, semL, 0.15), HOUSE.contrast.accent);

  const m = HOUSE.mood[mood];
  const d = HOUSE.density[density];
  const tex = HOUSE.texture[textureName];

  const taste = TasteProfile.parse({
    id: seed.id,
    name: seed.name ?? seed.id,
    palette: { bg, surface, surfaceAlt, border, text, muted, accent, accent2, warn, danger, ok },
    type: {
      display: { family: seed.fonts?.display ?? 'JetBrains Mono', weight: 800, tracking: -0.035, lineHeight: 1.04, transform: 'none' },
      body: { family: seed.fonts?.body ?? 'Inter', weight: 400, tracking: -0.01, lineHeight: 1.44, transform: 'none' },
      mono: { family: seed.fonts?.mono ?? 'JetBrains Mono', weight: 400, tracking: 0, lineHeight: 1.55, transform: 'none' },
      scale: (seed.scale ?? 1) * d.unitScale,
    },
    motion: { personality: mood, enter: m.enter, exit: m.exit, stagger: d.stagger, ease: m.ease, spring: m.spring, travel: m.travel },
    pacing: { sceneMin: d.sceneMin, sceneMax: d.sceneMax, wordsPerMinute: seed.wordsPerMinute ?? 158, cutOn: seed.cutOn ?? 'bar', breath: d.breath },
    texture: { ...tex, cornerRadius: seed.cornerRadius ?? (textureName === 'crt' ? 8 : 18) },
    transition: { kind: 'fade', duration: mood === 'smooth' ? 0.4 : 0.2 },
    music: { energy: mood === 'smooth' ? 'low' : 'high', duckDb: -13, targetLufs: -14 },
  });

  return { taste, notes };
}

export interface AuditIssue { level: 'error' | 'warn'; field: string; message: string; fix?: string }

/** Check a hand-authored profile against the house floors without changing it. */
export function audit(taste: TasteProfile): AuditIssue[] {
  const out: AuditIssue[] = [];
  const p = taste.palette;
  const check = (field: string, hex: string, floor: number) => {
    const c = contrast(hex, p.bg);
    if (c < floor) {
      out.push({
        level: c < floor * 0.7 ? 'error' : 'warn',
        field: `palette.${field}`,
        message: `${c.toFixed(2)}:1 against bg, below the ${floor}:1 floor`,
        fix: ensureContrast(hex, p.bg, floor).hex,
      });
    }
  };
  check('text', p.text, HOUSE.contrast.body);
  check('muted', p.muted, HOUSE.contrast.muted);
  check('accent', p.accent, HOUSE.contrast.accent);
  check('accent2', p.accent2, HOUSE.contrast.accent);
  check('ok', p.ok, HOUSE.contrast.accent);
  check('warn', p.warn, HOUSE.contrast.accent);
  check('danger', p.danger, HOUSE.contrast.accent);

  if (contrast(p.text, p.surface) < HOUSE.contrast.body * 0.8) {
    out.push({ level: 'warn', field: 'palette.surface', message: `text on surface is only ${contrast(p.text, p.surface).toFixed(2)}:1 — code and terminal blocks will be hard to read` });
  }
  if (taste.type.scale < 0.8) {
    out.push({ level: 'warn', field: 'type.scale', message: `${taste.type.scale} is small for phone playback; below 0.8 body text stops being legible at 1080x1920` });
  }
  if (taste.pacing.sceneMin < 1.5) {
    out.push({ level: 'warn', field: 'pacing.sceneMin', message: `${taste.pacing.sceneMin}s is below the time needed to read a headline` });
  }
  return out;
}

/** Apply the audit's suggested fixes. */
export function repair(taste: TasteProfile): { taste: TasteProfile; applied: AuditIssue[] } {
  const issues = audit(taste);
  const palette = { ...taste.palette } as Record<string, string>;
  const applied: AuditIssue[] = [];
  for (const i of issues) {
    if (i.fix && i.field.startsWith('palette.')) {
      palette[i.field.slice(8)] = i.fix;
      applied.push(i);
    }
  }
  return { taste: TasteProfile.parse({ ...taste, palette }), applied };
}
