import { z } from 'zod';

/** Shared value types. Split out of video.ts so the block registry can use them
 *  without importing the document schema it is used to build. */

/** Time values accept seconds (number), or musical/second strings:
 *  "4s" seconds · "8b" beats · "2bar" bars · "1:30" mm:ss */
export const TimeVal = z.union([
  z.number(),
  z.string().regex(/^(\d+(\.\d+)?(s|b|bar)|\d+:\d{2}(\.\d+)?)$/),
]);

export const CANVAS_PRESETS = {
  vertical:   { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
  square:     { width: 1080, height: 1080 },
} as const;

export const Canvas = z.object({
  preset: z.enum(['vertical', 'horizontal', 'square']).optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  fps: z.number().int().default(30),
}).transform((c) => {
  const p = c.preset ? CANVAS_PRESETS[c.preset] : null;
  const width = c.width ?? p?.width ?? 1080;
  const height = c.height ?? p?.height ?? 1920;
  return {
    width, height, fps: c.fps,
    orientation: width > height ? 'landscape' as const : width === height ? 'square' as const : 'portrait' as const,
  };
});

/** Procedural b-roll: an animated background layer beneath scene content.
 *  Deterministic, seeded, no footage required. */
export const Broll = z.object({
  kind: z.enum(['none','grid','dots','waves','particles','codeRain','orbits','mesh','beams','terrain','pulse','noise']).default('grid'),
  seed: z.number().int().default(1),
  speed: z.number().default(1),
  density: z.number().min(0).max(2).default(1),
  opacity: z.number().min(0).max(1).default(0.5),
  color: z.string().optional(),
  color2: z.string().optional(),
  /** slow push-in over the scene, like a Ken Burns move */
  drift: z.number().default(0.04),
});
export type Broll = z.infer<typeof Broll>;

export const Anim = z.object({
  kind: z.enum(['fade','rise','fall','pop','slideL','slideR','wipe','typewriter','blur','none']).default('rise'),
  dur: z.number().optional(),
  delay: z.number().default(0),
  ease: z.string().optional(),
  stagger: z.number().optional(),
});
export type Anim = z.infer<typeof Anim>;
