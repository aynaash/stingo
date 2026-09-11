import { z } from 'zod';
import { TasteProfile } from './taste';
import { Camera } from './camera';

/** Time values accept seconds (number), or musical/second strings:
 *  "4s" seconds · "8b" beats · "2bar" bars · "1:30" mm:ss */
export const TimeVal = z.union([z.number(), z.string().regex(/^(\d+(\.\d+)?(s|b|bar)|\d+:\d{2}(\.\d+)?)$/)]);

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
  return { width, height, fps: c.fps, orientation: width > height ? 'landscape' as const : width === height ? 'square' as const : 'portrait' as const };
});

/** Procedural b-roll: an animated background layer beneath scene content.
 *  Deterministic, seeded, no footage required. */
export const Broll = z.object({
  kind: z.enum(['none','grid','dots','waves','particles','codeRain','orbits','mesh','beams','terrain','pulse','noise']).default('grid'),
  seed: z.number().int().default(1),
  speed: z.number().default(1),
  density: z.number().min(0).max(2).default(1),
  opacity: z.number().min(0).max(1).default(0.5),
  /** override palette colors for this layer */
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

const base = {
  id: z.string().optional(),
  dur: TimeVal.optional(),
  at: TimeVal.optional(),
  bg: Broll.optional(),
  enter: Anim.optional(),
  exit: Anim.optional(),
  note: z.string().optional(),
  /** narration text for this scene — drives captions + duration estimate */
  say: z.string().optional(),
  /** a recorded take composited into this scene — see camera.ts */
  camera: Camera.optional(),
  /** override the taste's cut behaviour for this scene. Talking-head scenes
   *  default to `free`: snapping speech to a downbeat clips words. */
  cut: z.enum(['free', 'beat', 'bar']).optional(),
};

export const Scene = z.discriminatedUnion('block', [
  z.object({ ...base, block: z.literal('title'), text: z.string(), kicker: z.string().optional(), sub: z.string().optional(), align: z.enum(['left','center']).default('center') }),
  z.object({ ...base, block: z.literal('statement'), text: z.string(), emphasis: z.array(z.string()).default([]) }),
  z.object({ ...base, block: z.literal('code'), lang: z.string().default('ts'), code: z.string().optional(), file: z.string().optional(), highlight: z.array(z.number().int()).default([]), caption: z.string().optional(), reveal: z.enum(['all','lines','typewriter']).default('lines') }),
  z.object({ ...base, block: z.literal('terminal'), lines: z.array(z.object({ prompt: z.string().default('$'), cmd: z.string().optional(), out: z.string().optional(), delay: z.number().default(0) })), title: z.string().default('bash') }),
  z.object({ ...base, block: z.literal('stat'), value: z.string(), label: z.string(), sub: z.string().optional(), countFrom: z.string().optional() }),
  z.object({ ...base, block: z.literal('list'), title: z.string().optional(), items: z.array(z.string()), marker: z.enum(['num','dot','arrow','check']).default('arrow') }),
  z.object({ ...base, block: z.literal('chart'), kind: z.enum(['bar','line']).default('bar'), title: z.string().optional(), data: z.array(z.object({ label: z.string(), value: z.number() })), unit: z.string().default(''), highlightIndex: z.number().int().optional() }),
  z.object({ ...base, block: z.literal('quote'), text: z.string(), attrib: z.string().optional() }),
  z.object({ ...base, block: z.literal('compare'), left: z.object({ title: z.string(), items: z.array(z.string()) }), right: z.object({ title: z.string(), items: z.array(z.string()) }) }),
  z.object({ ...base, block: z.literal('broll'), caption: z.string().optional() }),
  z.object({ ...base, block: z.literal('outro'), text: z.string(), sub: z.string().optional(), handle: z.string().optional() }),
  z.object({ ...base, block: z.literal('camera'), camera: Camera, caption: z.string().optional(), lower: z.object({ name: z.string(), role: z.string().optional() }).optional() }),
]);
export type Scene = z.infer<typeof Scene>;

export const VideoDoc = z.object({
  title: z.string().default('untitled'),
  canvas: Canvas.prefault({}),
  /** taste id resolved from the taste library, or an inline profile */
  taste: z.union([z.string(), TasteProfile]).default('default'),
  audio: z.object({
    music: z.string().optional(),
    vo: z.string().optional(),
    bpm: z.union([z.number(), z.literal('auto')]).default('auto'),
    musicGainDb: z.number().default(-18),
  }).prefault({}),
  captions: z.object({
    enabled: z.boolean().default(false),
    style: z.enum(['word','line']).default('word'),
    burn: z.boolean().default(true),
  }).prefault({}),
  scenes: z.array(Scene).min(1),
});
export type VideoDoc = z.infer<typeof VideoDoc>;

export const parseVideo = (raw: unknown): VideoDoc => VideoDoc.parse(raw);
