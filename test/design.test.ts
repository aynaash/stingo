import { expect, test, describe } from 'bun:test';
import { hexToOklab, oklabToHex, atLightness, rotateHue, contrast, ensureContrast, mix, luminance } from '@stingo/themes';
import { derive, audit, repair, HOUSE, THEMES } from '@stingo/themes';

describe('oklab', () => {
  test('round-trips a colour exactly', () => {
    for (const hex of ['#a78bfa', '#2dd4bf', '#ff6b35', '#ffffff', '#000000', '#123456']) {
      expect(oklabToHex(hexToOklab(hex)), hex).toBe(hex);
    }
  });
  test('lightness moves in the direction asked', () => {
    const base = '#a78bfa';
    expect(luminance(atLightness(base, 0.9))).toBeGreaterThan(luminance(base));
    expect(luminance(atLightness(base, 0.2))).toBeLessThan(luminance(base));
  });
  test('a full hue rotation returns to the start', () => {
    const a = hexToOklab('#a78bfa');
    const b = hexToOklab(rotateHue('#a78bfa', 360));
    expect(Math.abs(a.a - b.a)).toBeLessThan(0.01);
    expect(Math.abs(a.b - b.b)).toBeLessThan(0.01);
  });
  test('mix endpoints are the inputs', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
  });
});

describe('contrast', () => {
  test('matches known WCAG values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 1);
    expect(contrast('#000000', '#000000')).toBeCloseTo(1, 5);
  });
  test('is symmetric', () => {
    expect(contrast('#a78bfa', '#0b0a14')).toBeCloseTo(contrast('#0b0a14', '#a78bfa'), 6);
  });
  test('leaves a passing colour untouched', () => {
    const r = ensureContrast('#f4f2ff', '#0b0a14', 4.5);
    expect(r.adjusted).toBe(false);
    expect(r.hex).toBe('#f4f2ff');
  });
  test('lifts a failing colour until it passes', () => {
    const r = ensureContrast('#3a3550', '#0b0a14', 4.5);
    expect(r.adjusted).toBe(true);
    expect(contrast(r.hex, '#0b0a14')).toBeGreaterThanOrEqual(4.5);
  });
  test('darkens against a light ground instead of lightening', () => {
    const r = ensureContrast('#cccccc', '#ffffff', 4.5);
    expect(luminance(r.hex)).toBeLessThan(luminance('#cccccc'));
    expect(contrast(r.hex, '#ffffff')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('derive', () => {
  const seeds = [
    { id: 'a', brand: '#ff6b35', mode: 'dark' as const },
    { id: 'b', brand: '#2563eb', mode: 'light' as const },
    { id: 'c', brand: '#2dd4bf', mode: 'dark' as const },
    { id: 'd', brand: '#e11d48', mode: 'light' as const },
  ];

  test('every derived profile clears the house floors', () => {
    for (const s of seeds) {
      const { taste } = derive(s);
      expect(audit(taste), `${s.id} (${s.brand}, ${s.mode})`).toEqual([]);
    }
  });

  test('derived palettes are complete and valid hex', () => {
    const { taste } = derive(seeds[0]!);
    for (const [k, v] of Object.entries(taste.palette)) {
      expect(v, k).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  test('light mode puts dark ink on a light ground', () => {
    const { taste } = derive({ id: 'l', brand: '#2563eb', mode: 'light' });
    expect(luminance(taste.palette.bg)).toBeGreaterThan(0.5);
    expect(luminance(taste.palette.text)).toBeLessThan(0.3);
  });

  test('dark mode does the reverse', () => {
    const { taste } = derive({ id: 'd', brand: '#2563eb', mode: 'dark' });
    expect(luminance(taste.palette.bg)).toBeLessThan(0.1);
    expect(luminance(taste.palette.text)).toBeGreaterThan(0.5);
  });

  test('mood selects the house curve, not an arbitrary one', () => {
    expect(derive({ id: 'm', brand: '#fff', mood: 'smooth' }).taste.motion.ease).toBe(HOUSE.mood.smooth.ease);
    expect(derive({ id: 'm', brand: '#fff', mood: 'bouncy' }).taste.motion.ease).toBe(HOUSE.mood.bouncy.ease);
  });

  test('density changes pacing and rhythm together', () => {
    const tight = derive({ id: 't', brand: '#fff', density: 'tight' }).taste;
    const airy = derive({ id: 'a', brand: '#fff', density: 'airy' }).taste;
    expect(airy.pacing.sceneMax).toBeGreaterThan(tight.pacing.sceneMax);
    expect(airy.motion.stagger).toBeGreaterThan(tight.motion.stagger);
    expect(airy.type.scale).toBeGreaterThan(tight.type.scale);
  });

  test('the support hue is genuinely distinct from the brand', () => {
    const { taste } = derive({ id: 's', brand: '#ff6b35' });
    const h = (x: string) => { const l = hexToOklab(x); return Math.atan2(l.b, l.a); };
    const delta = Math.abs(h(taste.palette.accent) - h(taste.palette.accent2));
    expect(Math.min(delta, Math.PI * 2 - delta)).toBeGreaterThan(1.5);
  });

  test('reports what it had to adjust', () => {
    const { notes } = derive({ id: 'weak', brand: '#2563eb', mode: 'light' });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.join(' ')).toMatch(/lifted/);
  });
});

describe('audit and repair', () => {
  test('built-in themes pass their own floors', () => {
    for (const [id, t] of Object.entries(THEMES)) {
      expect(audit(t).filter((i) => i.level === 'error'), id).toEqual([]);
    }
  });

  test('catches unreadable ink', () => {
    const broken = { ...THEMES.bootdev, palette: { ...THEMES.bootdev.palette, muted: '#15132a' } };
    const issues = audit(broken as any);
    expect(issues.some((i) => i.field === 'palette.muted')).toBe(true);
  });

  test('repair makes a broken palette pass', () => {
    const broken = { ...THEMES.bootdev, palette: { ...THEMES.bootdev.palette, muted: '#15132a', accent: '#1c1938' } };
    const { taste, applied } = repair(broken as any);
    expect(applied.length).toBeGreaterThan(0);
    expect(audit(taste).filter((i) => i.field.startsWith('palette.'))).toEqual([]);
  });

  test('flags a type scale too small for phone playback', () => {
    const tiny = { ...THEMES.bootdev, type: { ...THEMES.bootdev.type, scale: 0.6 } };
    expect(audit(tiny as any).some((i) => i.field === 'type.scale')).toBe(true);
  });
});
