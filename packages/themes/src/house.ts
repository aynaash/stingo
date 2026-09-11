/** The house style — stingo's own design opinion.
 *
 *  A taste profile declares intent: a brand colour, light or dark, a mood, a
 *  density. Everything a designer would call a *relationship* — type ratios,
 *  spacing rhythm, contrast floors, the lightness ramp of the neutrals, the
 *  order things animate in — lives here and is not the taste's to set.
 *
 *  This is why two different taste profiles still look like stingo videos, and
 *  why a badly chosen palette still produces a readable one. */

export const HOUSE = {
  /** Modular type scale. One ratio, applied consistently, is most of what
   *  separates designed typography from arbitrary font sizes. */
  typeRatio: 1.28,

  /** Readability floors, in WCAG contrast ratios against the background.
   *  Body text is held well above the 4.5 minimum because video is watched
   *  small, on phones, often in daylight. */
  contrast: { body: 7, heading: 7, muted: 4.5, accent: 4.5 },

  /** Where each neutral sits on the OKLab lightness ramp. Measured from the
   *  reference theme rather than guessed, so derived palettes feel the same. */
  ramp: {
    dark:  { bg: 0.152, surface: 0.205, surfaceAlt: 0.238, border: 0.312, muted: 0.640, text: 0.966 },
    light: { bg: 0.985, surface: 0.955, surfaceAlt: 0.925, border: 0.860, muted: 0.520, text: 0.235 },
  },

  /** How much of the brand hue bleeds into the neutrals. A trace of it is what
   *  makes a palette feel authored instead of grey-plus-an-accent. */
  neutralChroma: { bg: 0.021, surface: 0.045, surfaceAlt: 0.058, border: 0.070, muted: 0.057, text: 0.017 },

  /** Target chroma and lightness for accents, so any brand hue lands with
   *  comparable punch instead of whatever the author happened to type. */
  accent: { L: 0.71, C: 0.16 },
  support: { L: 0.78, C: 0.135, hueShift: 168 },

  /** Semantic colours are hue-locked — green reads as success in every taste. */
  semantic: { ok: 145, warn: 85, danger: 25 },

  /** Spacing and pacing per density. Every gap in every block is a multiple of
   *  the unit, so rhythm survives a taste change. */
  density: {
    tight:  { unitScale: 0.92, sceneMin: 2.2, sceneMax: 10, breath: 0.22, stagger: 0.055 },
    normal: { unitScale: 1.0,  sceneMin: 2.8, sceneMax: 13, breath: 0.32, stagger: 0.072 },
    airy:   { unitScale: 1.1,  sceneMin: 3.6, sceneMax: 16, breath: 0.5,  stagger: 0.1 },
  },

  /** Mood maps to a curve and a travel distance. The taste picks the mood; the
   *  mapping is ours, so "snappy" means the same thing in every profile. */
  mood: {
    snappy:     { ease: 'expo.out',    enter: 0.42, exit: 0.26, travel: 56, spring: { stiffness: 195, damping: 17, mass: 1 } },
    smooth:     { ease: 'cubic.inOut', enter: 0.62, exit: 0.4,  travel: 32, spring: { stiffness: 120, damping: 20, mass: 1 } },
    bouncy:     { ease: 'back.out',    enter: 0.55, exit: 0.3,  travel: 64, spring: { stiffness: 210, damping: 12, mass: 1 } },
    mechanical: { ease: 'linear',      enter: 0.3,  exit: 0.18, travel: 40, spring: { stiffness: 300, damping: 30, mass: 1 } },
  },

  /** Film treatment presets. Texture is taste; these are the tuned amounts. */
  texture: {
    clean: { grain: 0.012, scanlines: 0,     vignette: 0.22, glow: 0.3,  grid: 0.05 },
    film:  { grain: 0.055, scanlines: 0,     vignette: 0.42, glow: 0.45, grid: 0.08 },
    crt:   { grain: 0.045, scanlines: 0.035, vignette: 0.5,  glow: 0.6,  grid: 0.12 },
    flat:  { grain: 0,     scanlines: 0,     vignette: 0,    glow: 0.2,  grid: 0.06 },
  },

  /** Entrance choreography, in seconds after a scene starts. The order a scene
   *  assembles itself in is a signature, not a preference. */
  choreography: { rule: 0, kicker: 0.06, headline: 0.12, sub: 0.3, body: 0.22, caption: 0.4 },
} as const;

export type Density = keyof typeof HOUSE.density;
export type Mood = keyof typeof HOUSE.mood;
export type TextureName = keyof typeof HOUSE.texture;
