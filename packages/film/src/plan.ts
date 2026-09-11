import { Timeline, toSeconds, snap, speakDuration, type BeatGrid, type Cue, DEFAULT_GRID } from '@stingo/core';
import type { VideoDoc, TasteProfile, Scene } from '@stingo/schema';

/** Fallback scene length by block type, before taste pacing clamps it. */
const DEFAULT_DUR: Record<Scene['block'], number> = {
  title: 4.5, statement: 4, quote: 6, list: 7, outro: 5, broll: 3.5,
  code: 8, terminal: 9, stat: 4.5, chart: 7, compare: 7.5, camera: 8,
};

/** Measured lengths of the takes referenced by a document, keyed by resolved
 *  path. Probing is async and planning is not, so the durations are gathered
 *  once up front — see probeClips. */
export type ClipTable = Map<string, number>;

/** Estimate a scene's natural length: explicit > narration > block default.
 *  Content-aware bumps keep dense scenes on screen long enough to read. */
export function estimateDuration(scene: Scene, taste: TasteProfile, grid: BeatGrid = DEFAULT_GRID, clips?: ClipTable): number {
  if (scene.dur != null) return toSeconds(scene.dur, grid);

  // a talking-head scene runs as long as the take does. Pacing bounds exist to
  // stop a caption sitting on screen too long; they have no business trimming
  // a sentence someone is in the middle of saying.
  if (scene.block === 'camera') {
    const len = clips?.get(scene.camera.src);
    if (len != null) {
      const from = toSeconds(scene.camera.from, grid);
      const remaining = len - from;
      if (remaining > 0.05) return remaining;
    }
    return DEFAULT_DUR.camera;
  }
  let d = scene.say ? speakDuration(scene.say, taste.pacing.wordsPerMinute, taste.pacing.breath) : DEFAULT_DUR[scene.block];

  // reading time scales with how much is actually on screen
  if (scene.block === 'code' && scene.code) {
    const lines = scene.code.trim().split('\n').length;
    d = Math.max(d, 1.8 + lines * 0.42);
  } else if (scene.block === 'list') {
    d = Math.max(d, 1.6 + scene.items.length * 0.95);
  } else if (scene.block === 'terminal') {
    const cost = scene.lines.reduce((a, l) => a + (l.cmd ? 0.3 + l.cmd.length * 0.028 : 0) + (l.out ? 0.5 : 0.2), 0);
    d = Math.max(d, 1.2 + cost);
  } else if (scene.block === 'compare') {
    d = Math.max(d, 2 + (scene.left.items.length + scene.right.items.length) * 0.55);
  } else if (scene.block === 'chart') {
    d = Math.max(d, 2.2 + scene.data.length * 0.55);
  }
  return Math.min(Math.max(d, taste.pacing.sceneMin), taste.pacing.sceneMax);
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
