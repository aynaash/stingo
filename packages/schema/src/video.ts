import { z } from 'zod';
import { TasteProfile } from './taste';
import { SceneField, type SceneData } from './registry';
export { TimeVal, CANVAS_PRESETS, Canvas, Broll, Anim } from './primitives';
import { Canvas } from './primitives';

/** The Scene schema is composed from the block registry, not written here.
 *  Blocks register themselves on import, and the registry is consulted on every
 *  parse — so registration order never matters. */
export const Scene = SceneField;
export type Scene = SceneData;

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
  scenes: z.array(SceneField).min(1),
});
export type VideoDoc = z.infer<typeof VideoDoc>;

export const parseVideo = (raw: unknown): VideoDoc => VideoDoc.parse(raw);
