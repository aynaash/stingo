import { z } from 'zod';
import { Broll, TimeVal, Anim } from './primitives';
import { Camera } from './camera';

/** Block registry.
 *
 *  A block used to be spread across seven files: the schema union, the renderer,
 *  the BLOCKS map, an export, a duration default, a content-aware duration
 *  estimate, and a default b-roll. Adding one meant finding all seven, and
 *  missing any of them produced a block that half-worked.
 *
 *  Now a block is one `defineBlock` call. The scene schema, the renderer table,
 *  the duration rules and the b-roll defaults are all derived from what has been
 *  registered. Nothing central needs editing to add a block — including from
 *  outside this repo. */

/** Fields every scene has, whatever its block. */
export const BASE_FIELDS = {
  id: z.string().optional(),
  dur: TimeVal.optional(),
  at: TimeVal.optional(),
  bg: Broll.optional(),
  enter: Anim.optional(),
  exit: Anim.optional(),
  note: z.string().optional(),
  /** narration for this scene — drives captions and the duration estimate */
  say: z.string().optional(),
  /** a recorded take composited into this scene — see camera.ts */
  camera: Camera.optional(),
  /** override the taste's cut behaviour for this scene. Talking-head scenes
   *  default to `free`: snapping speech to a downbeat clips words. */
  cut: z.enum(['free', 'beat', 'bar']).optional(),
  /** Drop the art direction for this scene: no anchored composition, no rule,
   *  no corner marks, no scene numeral. For frames that are not part of a film
   *  — a thumbnail, a title card, an exported still — where furniture that
   *  orients a viewer through eight minutes is just clutter. */
  plain: z.boolean().optional(),
} as const;

export type BaseScene = z.infer<z.ZodObject<typeof BASE_FIELDS>> & { block: string };

/** What an estimate can see besides the scene itself. Measured take lengths
 *  arrive here because probing a file is async and planning is not. */
export interface DurationCtx {
  /** words per minute and breath, from the taste profile */
  wordsPerMinute: number;
  breath: number;
  /** measured durations of referenced media, keyed by source */
  clips?: Map<string, number>;
  /** resolve "8b" / "2bar" against the beat grid */
  seconds: (v: number | string | undefined, fallback?: number) => number;
}

export interface BlockDuration<S = any> {
  /** fallback length in seconds when nothing better is known */
  base: number;
  /** Content-aware length: more code lines or list items earn more time.
   *  Return null to fall back to `base`. The planner takes the larger of this
   *  and the narration estimate, then clamps to the taste's pacing bounds. */
  estimate?: (scene: S, ctx: DurationCtx) => number | null;
  /** Skip the taste's pacing clamp. A talking-head take runs as long as the
   *  take does; trimming it mid-sentence is never right. */
  exact?: boolean;
}

export interface BlockDef<Shape extends z.ZodRawShape = z.ZodRawShape, Ctx = any, Out = any> {
  /** the discriminator value, e.g. 'title' */
  name: string;
  /** block-specific fields; the base fields are added automatically */
  fields: Shape;
  /** how long this block wants to be on screen */
  duration: BlockDuration<any>;
  /** default animated background when the scene does not specify one */
  broll?: Partial<z.infer<typeof Broll>>;
  /** draw one frame */
  render: (scene: any, ctx: Ctx) => Out;
  /** one-line description, surfaced by `stingo blocks` */
  describe?: string;
}

const registry = new Map<string, BlockDef<any, any, any>>();
let cachedScene: z.ZodTypeAny | null = null;

/** Register a block. Call it at module top level; importing the module is what
 *  installs the block, so a block file has no other wiring. */
export function defineBlock<Shape extends z.ZodRawShape, Ctx = any, Out = any>(
  def: BlockDef<Shape, Ctx, Out> & {
    render: (scene: z.infer<z.ZodObject<Shape>> & BaseScene, ctx: Ctx) => Out;
  },
): BlockDef<Shape, Ctx, Out> {
  // Last registration wins. Overriding a built-in is a legitimate thing to
  // want, and a hard error here would also crash on the mundane case of a
  // module being evaluated twice through two resolved paths (symlinked
  // workspaces do this). `stingo blocks` shows which definition won.
  registry.set(def.name, def as BlockDef<any, any, any>);
  cachedScene = null;   // a new block changes the scene union
  return def;
}

export const getBlock = (name: string) => registry.get(name);
export const blockNames = () => [...registry.keys()].sort();
export const allBlocks = () => [...registry.values()];
export const hasBlock = (name: string) => registry.has(name);

/** For tests and for swapping block sets between renders. */
export function clearBlocks() { registry.clear(); cachedScene = null; }

/** The Scene schema, composed from whatever is registered.
 *  Built lazily and cached, so registration order does not matter. */
export function sceneSchema(): z.ZodTypeAny {
  if (cachedScene) return cachedScene;
  const defs = allBlocks();
  if (defs.length === 0) {
    // Throwing here would be raised from inside z.lazy's getter, where zod
    // mangles it into an internal TypeError *and* memoises the broken
    // resolution — poisoning every later parse in the process. Returning a
    // schema that always fails keeps the error legible and uncached.
    return z.any().superRefine((_v, ctx) => {
      ctx.addIssue({
        code: 'custom',
        message: 'no blocks are registered — import "@stingo/blocks" (or the "stingo" package) before parsing a video document',
      });
    });
  }
  const variants = defs.map((d) =>
    z.object({ ...BASE_FIELDS, ...d.fields, block: z.literal(d.name) }),
  );
  cachedScene = variants.length === 1
    ? variants[0]!
    : z.discriminatedUnion('block', variants as [z.ZodObject<any>, ...z.ZodObject<any>[]]);
  return cachedScene;
}

/** Scenes are validated through the registry, so the type is structural.
 *  Inside a renderer the scene is precisely typed by that block's own fields.
 *  Named SceneData here; `Scene` (both schema and type) is re-exported from
 *  video.ts, so the two never collide on the package's public surface. */
export type SceneData = BaseScene & Record<string, any>;

export const parseScene = (raw: unknown): SceneData => sceneSchema().parse(raw) as SceneData;

/** A schema that resolves the registry on every parse.
 *
 *  `z.lazy` looks like the right tool and is not: it memoises the resolved
 *  inner schema, so a block registered after the first parse could never join
 *  the union. This delegates instead, which costs a map lookup per scene and
 *  keeps registration order irrelevant. */
export const SceneField: z.ZodType<SceneData> = z.any().transform((val, ctx) => {
  const result = sceneSchema().safeParse(val);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue(issue as any);
    return z.NEVER;
  }
  return result.data as SceneData;
}) as unknown as z.ZodType<SceneData>;

/** Duration rules, read by the planner. */
export function blockDuration(name: string): BlockDuration<any> {
  return getBlock(name)?.duration ?? { base: 5 };
}

/** Default b-roll for a block, read by the compositor. */
export function blockBroll(name: string): Partial<z.infer<typeof Broll>> {
  return getBlock(name)?.broll ?? { kind: 'grid', opacity: 0.3 };
}
