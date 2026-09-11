import { probeVideo } from '@stingo/media';
import type { VideoDoc } from '@stingo/schema';
import type { ClipTable } from './plan';

export interface ClipInfo { src: string; duration: number; width: number; height: number; fps: number; hasAudio: boolean }

/** Measure every take a document references, once.
 *
 *  Planning has to stay synchronous — it runs inside each render worker and in
 *  tests — so the one async fact it needs (how long each clip is) is gathered
 *  here and passed in. Unreadable sources are reported rather than thrown, so
 *  a script whose footage is not shot yet still plans and previews. */
export async function probeClips(doc: VideoDoc): Promise<{ clips: ClipTable; info: ClipInfo[]; missing: string[] }> {
  const srcs = [...new Set(doc.scenes.map((s) => s.camera?.src).filter((s): s is string => !!s))];
  const clips: ClipTable = new Map();
  const info: ClipInfo[] = [];
  const missing: string[] = [];

  await Promise.all(srcs.map(async (src) => {
    try {
      const m = await probeVideo(src);
      clips.set(src, m.duration);
      info.push({ src, duration: m.duration, width: m.width, height: m.height, fps: m.fps, hasAudio: m.hasAudio });
    } catch {
      missing.push(src);
    }
  }));

  info.sort((a, b) => a.src.localeCompare(b.src));
  return { clips, info, missing: missing.sort() };
}

/** The takes that contribute audio, placed on the timeline. Drives the mix. */
export function cameraAudioCuts(doc: VideoDoc, timeline: { cues: { index: number; start: number; dur: number }[] }, clipHasAudio: (src: string) => boolean) {
  const cuts: { src: string; from: number | string; at: number; dur: number; gainDb: number }[] = [];
  for (const cue of timeline.cues) {
    const scene = doc.scenes[cue.index];
    const cam = scene?.camera;
    if (!cam || cam.mute || !clipHasAudio(cam.src)) continue;
    cuts.push({ src: cam.src, from: cam.from, at: cue.start, dur: cue.dur, gainDb: cam.gainDb });
  }
  return cuts;
}
