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

/** Warn where a scene's narration will not fit the time the scene has.
 *
 *  `say` sets a scene's length, so most of the time it fits by construction.
 *  It stops fitting when something else wins: an explicit `dur`, the taste's
 *  `sceneMax` ceiling, a camera take that owns its own length, or a cut snapped
 *  back onto the grid. In all four cases the overrun is silent — the video
 *  renders, the scene is simply shorter than the words take to say.
 *
 *  This is the failure captions exist to expose, so it is reported before the
 *  render rather than discovered in one. */
export function sayWarnings(doc: VideoDoc, taste: TasteProfile, timeline: Timeline): string[] {
  const out: string[] = [];
  const { wordsPerMinute: wpm, breath } = taste.pacing;

  timeline.cues.forEach((cue) => {
    const scene = doc.scenes[cue.index] as Scene & { say?: string };
    const say = scene?.say;
    if (typeof say !== 'string' || !say.trim()) return;

    const needed = speakDuration(say, wpm, breath);
    // a fifth of a second is inside the error of any words-per-minute estimate,
    // so warning on it would cry wolf on scenes that are effectively exact
    if (needed <= cue.dur + 0.2) return;

    const over = needed - cue.dur;
    const words = say.trim().split(/\s+/).filter(Boolean).length;
    // what to cut is the actionable number; the seconds are the evidence
    const cut = Math.ceil((over * wpm) / 60);
    out.push(
      `scene ${cue.index} ("${cue.id}") says ${words} words in ${cue.dur.toFixed(1)}s — `
      + `that is ${needed.toFixed(1)}s of speech at ${wpm} wpm, ${over.toFixed(1)}s over. `
      + `Cut about ${cut} word${cut === 1 ? '' : 's'}, or set \`dur: ${Math.ceil(needed)}\` on the scene`,
    );
  });
  return out;
}

/** Per-scene shooting lengths for the takes a script needs, in the order they
 *  are shot in. Printed before a shoot, so the camera scenes have a number on
 *  them while the camera is still set up. */
export interface TakeBudget { index: number; id: string; dur: number; src?: string; say?: string }

export function takeBudget(doc: VideoDoc, timeline: Timeline): TakeBudget[] {
  return timeline.cues
    .filter((c) => (doc.scenes[c.index] as Scene | undefined)?.camera)
    .map((c) => {
      const scene = doc.scenes[c.index] as Scene & { say?: string };
      return { index: c.index, id: c.id, dur: c.dur, src: scene.camera?.src, say: scene.say };
    });
}
