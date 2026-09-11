import { Timeline, toSeconds, snap, speakDuration, type BeatGrid, type Cue, DEFAULT_GRID } from '@stingo/core';
import type { VideoDoc, TasteProfile, Scene, DurationCtx } from '@stingo/schema';
import { blockDuration } from '@stingo/schema';

/** Measured lengths of the takes referenced by a document, keyed by resolved
 *  path. Probing is async and planning is not, so the durations are gathered
 *  once up front — see probeClips. */
export type ClipTable = Map<string, number>;

/** Estimate a scene's natural length: explicit > block estimate > narration >
 *  block default, then clamped to the taste's pacing bounds.
 *
 *  Nothing here knows what any particular block is. The rules come from the
 *  block's own `duration` spec, so a new block brings its timing with it. */
export function estimateDuration(
  scene: Scene, taste: TasteProfile, grid: BeatGrid = DEFAULT_GRID, clips?: ClipTable,
): number {
  if (scene.dur != null) return toSeconds(scene.dur, grid);

  const spec = blockDuration(scene.block);
  const ctx: DurationCtx = {
    wordsPerMinute: taste.pacing.wordsPerMinute,
    breath: taste.pacing.breath,
    clips,
    seconds: (v, fallback = 0) => toSeconds(v, grid, fallback),
  };

  const fromBlock = spec.estimate?.(scene, ctx) ?? null;

  // an exact block owns its length outright — a take that is cut mid-sentence
  // to satisfy a pacing bound is worse than a scene that runs long
  if (spec.exact && fromBlock != null) return fromBlock;

  // narration replaces the block's default length; the content estimate then
  // acts as a floor on top of that, never a replacement for it
  const primary = scene.say
    ? speakDuration(scene.say, taste.pacing.wordsPerMinute, taste.pacing.breath)
    : spec.base;
  const chosen = Math.max(primary, fromBlock ?? 0);

  if (spec.exact) return chosen;
  return Math.min(Math.max(chosen, taste.pacing.sceneMin), taste.pacing.sceneMax);
}

export interface PlanResult { timeline: Timeline; warnings: string[] }

/** Resolve every scene to absolute seconds, snapping cuts to the music grid. */
export function plan(doc: VideoDoc, taste: TasteProfile, grid: BeatGrid = DEFAULT_GRID, clips?: ClipTable): PlanResult {
  const warnings: string[] = [];
  const cues: Cue[] = [];
  let t = 0;

  doc.scenes.forEach((scene, i) => {
    const start = scene.at != null ? toSeconds(scene.at, grid) : t;
    if (scene.at != null && start < t) warnings.push(`scene ${i} ("${scene.id ?? scene.block}") starts at ${start.toFixed(2)}s, overlapping the previous scene ending at ${t.toFixed(2)}s`);
    let dur = estimateDuration(scene, taste, grid, clips);

    // snap the *end* to the grid so cuts land on the music. Speech is the
    // exception: a talking head snapped to a downbeat gets its last word
    // clipped, so camera scenes cut free unless the script says otherwise.
    const cutOn = scene.cut ?? (scene.block === 'camera' ? 'free' : taste.pacing.cutOn);
    let end = start + dur;
    if (cutOn !== 'free') {
      const snapped = snap(end, cutOn, grid);
      // never snap a scene below its readable minimum
      end = snapped > start + taste.pacing.sceneMin * 0.75 ? snapped : snap(end + (cutOn === 'bar' ? 1 : 0.5), cutOn, grid);
      dur = end - start;
    }

    cues.push({ id: scene.id ?? `${scene.block}-${i}`, index: i, block: scene.block, start, end, dur });
    t = end;
  });

  return { timeline: new Timeline(cues, grid, doc.canvas.fps), warnings };
}
