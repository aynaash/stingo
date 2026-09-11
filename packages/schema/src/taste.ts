import { z } from 'zod';

/** A Taste Profile is the "how it looks and feels" half of a video.
 *  Content lives in the video doc; aesthetics live here. Same content,
 *  different taste.json, completely different film. */

export const Hex = z.string().regex(/^#([0-9a-fA-F]{3,8})$/, 'must be a hex color');

export const Palette = z.object({
  bg: Hex.default('#0d0b1a'),
  surface: Hex.default('#16132a'),
  surfaceAlt: Hex.default('#1e1a38'),
  border: Hex.default('#2a2547'),
  text: Hex.default('#f2f0ff'),
  muted: Hex.default('#8b86a8'),
  accent: Hex.default('#a78bfa'),
  accent2: Hex.default('#2dd4bf'),
  warn: Hex.default('#fbbf24'),
  danger: Hex.default('#f87171'),
  ok: Hex.default('#4ade80'),
});
export type Palette = z.infer<typeof Palette>;

export const FontSpec = z.object({
  family: z.string(),
  weight: z.number().int().min(100).max(900).default(400),
  tracking: z.number().default(0),      // letter-spacing in em
  lineHeight: z.number().default(1.2),
  transform: z.enum(['none', 'upper', 'lower']).default('none'),
});

export const Typography = z.object({
  display: FontSpec.prefault({ family: 'JetBrains Mono', weight: 800, tracking: -0.03, lineHeight: 1.05, transform: 'none' }),
  body: FontSpec.prefault({ family: 'JetBrains Mono', weight: 400, tracking: 0, lineHeight: 1.45, transform: 'none' }),
  mono: FontSpec.prefault({ family: 'JetBrains Mono', weight: 400, tracking: 0, lineHeight: 1.55, transform: 'none' }),
  /** multiplies every font size; 1.0 = design default */
  scale: z.number().min(0.5).max(2).default(1),
});

/** Motion personality — the single knob that most changes how a video "feels". */
export const Motion = z.object({
  personality: z.enum(['snappy', 'smooth', 'bouncy', 'mechanical']).default('snappy'),
  /** seconds for a standard element entrance */
  enter: z.number().default(0.45),
  exit: z.number().default(0.3),
  /** seconds between staggered siblings */
  stagger: z.number().default(0.07),
  /** default easing curve name, see core/easing */
  ease: z.string().default('expo.out'),
  /** spring config used when ease === 'spring' */
  spring: z.object({ stiffness: z.number().default(170), damping: z.number().default(18), mass: z.number().default(1) }).prefault({}),
  /** how far elements travel on entrance, in px at 1080 wide */
  travel: z.number().default(48),
});

export const Pacing = z.object({
  /** target seconds per scene; the planner warns outside this band */
  sceneMin: z.number().default(3),
  sceneMax: z.number().default(14),
  /** narration speed used to estimate scene duration from text */
  wordsPerMinute: z.number().default(155),
  /** snap scene boundaries to the music grid */
  cutOn: z.enum(['free', 'beat', 'bar']).default('bar'),
  /** dead air held after a line lands, in seconds */
  breath: z.number().default(0.35),
});

/** Full-frame treatment. Cheap to render, enormous effect on "does this look made". */
export const Texture = z.object({
  grain: z.number().min(0).max(1).default(0.05),
  scanlines: z.number().min(0).max(1).default(0),
  vignette: z.number().min(0).max(1).default(0.35),
  glow: z.number().min(0).max(1).default(0.4),
  grid: z.number().min(0).max(1).default(0.08),
  cornerRadius: z.number().default(20),
});

export const TasteProfile = z.object({
  id: z.string().default('default'),
  name: z.string().default('Default'),
  palette: Palette.prefault({}),
  type: Typography.prefault({}),
  motion: Motion.prefault({}),
  pacing: Pacing.prefault({}),
  texture: Texture.prefault({}),
  /** default scene-to-scene transition */
  transition: z.object({
    kind: z.enum(['cut', 'fade', 'wipe', 'whip', 'glitch', 'slide']).default('cut'),
    duration: z.number().default(0.25),
  }).prefault({}),
  music: z.object({
    energy: z.enum(['low', 'medium', 'high']).default('medium'),
    duckDb: z.number().default(-12),
    targetLufs: z.number().default(-14),
  }).prefault({}),
});
export type TasteProfile = z.infer<typeof TasteProfile>;

export const parseTaste = (raw: unknown): TasteProfile => TasteProfile.parse(raw);
