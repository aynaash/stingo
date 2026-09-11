import type { TasteProfile } from '@stingo/schema';

/** Dark, mono-forward, gamified-terminal energy. Purple lead, teal support. */
export const bootdev: TasteProfile = {
  id: 'bootdev',
  name: 'Boot Camp',
  palette: {
    bg: '#0b0a14', surface: '#15132a', surfaceAlt: '#1c1938', border: '#2e2a52',
    text: '#f4f2ff', muted: '#8a85ab', accent: '#a78bfa', accent2: '#2dd4bf',
    warn: '#fbbf24', danger: '#fb7185', ok: '#4ade80',
  },
  type: {
    display: { family: 'JetBrains Mono', weight: 800, tracking: -0.035, lineHeight: 1.04, transform: 'none' },
    body:    { family: 'Inter',         weight: 400, tracking: -0.01, lineHeight: 1.42, transform: 'none' },
    mono:    { family: 'JetBrains Mono', weight: 400, tracking: 0, lineHeight: 1.55, transform: 'none' },
    scale: 1,
  },
  motion: { personality: 'snappy', enter: 0.42, exit: 0.28, stagger: 0.075, ease: 'expo.out',
            spring: { stiffness: 190, damping: 17, mass: 1 }, travel: 54 },
  pacing: { sceneMin: 3, sceneMax: 14, wordsPerMinute: 158, cutOn: 'bar', breath: 0.35 },
  texture: { grain: 0.055, scanlines: 0.03, vignette: 0.42, glow: 0.5, grid: 0.1, cornerRadius: 22 },
  transition: { kind: 'fade', duration: 0.22 },
  music: { energy: 'high', duckDb: -13, targetLufs: -14 },
};

/** Warmer, calmer sibling — same bones, different taste. Proves the profile does real work. */
export const dusk: TasteProfile = {
  ...bootdev,
  id: 'dusk', name: 'Dusk',
  palette: { bg: '#12100e', surface: '#1e1a16', surfaceAlt: '#2a241e', border: '#3d342a',
             text: '#f5efe6', muted: '#a2937f', accent: '#f59e0b', accent2: '#ef7f5b',
             warn: '#fbbf24', danger: '#e05252', ok: '#84cc16' },
  motion: { ...bootdev.motion, personality: 'smooth', ease: 'cubic.inOut', enter: 0.6, stagger: 0.1, travel: 32 },
  pacing: { ...bootdev.pacing, cutOn: 'free', wordsPerMinute: 142, breath: 0.5 },
  texture: { grain: 0.09, scanlines: 0, vignette: 0.5, glow: 0.25, grid: 0, cornerRadius: 6 },
  transition: { kind: 'fade', duration: 0.5 },
};

export const THEMES = { bootdev, dusk } as const;
export type ThemeName = keyof typeof THEMES;
