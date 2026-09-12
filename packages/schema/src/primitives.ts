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

/** What plays behind a scene.
 *
 *  Two kinds, in one shape so that `bg:` stays one field. Without `src` this is
 *  procedural: seeded, deterministic, no footage required. With `src` it is your
 *  own media — a clip or a still — and the procedural generator is not used.
 *
 *  A still and a clip go down the same path; a picture is a one-frame clip that
 *  holds, which is exactly what a backdrop wants anyway. */
export const Broll = z.object({
  kind: z.enum(['none','grid','dots','waves','particles','codeRain','orbits','mesh','beams','terrain','pulse','noise']).default('grid'),

  /** your own footage or image; when set, `kind` is ignored */
  src: z.string().optional(),
  /** in-point within the clip */
  from: z.union([z.number(), z.string()]).default(0),
  fit: z.enum(['cover', 'contain']).default('cover'),
  /** push in past the fit */
  zoom: z.number().min(1).max(4).default(1),
  /** pan within the frame, as a fraction of it */
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  mirror: z.boolean().default(false),
  /** Darken the backdrop so type stays readable over it. Media is the one place
   *  a taste profile cannot guarantee contrast — stingo has no say over what is
   *  in your footage — so this defaults high rather than to nothing. */
  scrim: z.number().min(0).max(1).default(0.55),
  /** repeat a clip shorter than the scene instead of holding its last frame */
  loop: z.boolean().default(true),
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
