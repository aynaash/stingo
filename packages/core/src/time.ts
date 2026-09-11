/** Musical + wall-clock time. The beat grid is what makes cuts land on the music. */

export interface BeatGrid {
  bpm: number;
  /** seconds of the first downbeat */
  offset: number;
  beatsPerBar: number;
  /** detected onset times in seconds, if available */
  onsets?: number[];
}

export const DEFAULT_GRID: BeatGrid = { bpm: 120, offset: 0, beatsPerBar: 4 };

export const beatDur = (g: BeatGrid) => 60 / g.bpm;
export const barDur = (g: BeatGrid) => (60 / g.bpm) * g.beatsPerBar;
/** seconds at beat n */
export const beat = (n: number, g: BeatGrid = DEFAULT_GRID) => g.offset + n * beatDur(g);
/** seconds at bar n */
export const bar = (n: number, g: BeatGrid = DEFAULT_GRID) => g.offset + n * barDur(g);

/** Parse "4s" | "8b" | "2bar" | "1:30" | 4 → seconds. */
export function toSeconds(v: number | string | undefined, g: BeatGrid = DEFAULT_GRID, fallback = 0): number {
  if (v == null) return fallback;
  if (typeof v === 'number') return v;
  const mmss = /^(\d+):(\d{2}(?:\.\d+)?)$/.exec(v);
  if (mmss) return parseInt(mmss[1]!, 10) * 60 + parseFloat(mmss[2]!);
  const m = /^(\d+(?:\.\d+)?)(s|b|bar)$/.exec(v);
  if (!m) throw new Error(`bad time value: ${v}`);
  const n = parseFloat(m[1]!);
  return m[2] === 's' ? n : m[2] === 'b' ? n * beatDur(g) : n * barDur(g);
}

/** Snap a time to the nearest beat/bar. How "cutOn" in a taste profile is enforced. */
export function snap(seconds: number, mode: 'free' | 'beat' | 'bar', g: BeatGrid): number {
  if (mode === 'free') return seconds;
  const unit = mode === 'beat' ? beatDur(g) : barDur(g);
  return g.offset + Math.round((seconds - g.offset) / unit) * unit;
}

/** Estimate how long narration takes to speak, for auto scene durations. */
export function speakDuration(text: string, wpm = 155, breath = 0.35): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words === 0 ? 0 : (words / wpm) * 60 + breath;
}

export interface Cue { id: string; index: number; block: string; start: number; end: number; dur: number }

/** A resolved schedule: every scene pinned to absolute seconds. */
export class Timeline {
  constructor(readonly cues: Cue[], readonly grid: BeatGrid, readonly fps: number) {}
  get duration() { return this.cues.length ? this.cues[this.cues.length - 1]!.end : 0; }
  get frameCount() { return Math.ceil(this.duration * this.fps); }
  /** the cue playing at time t, plus local progress 0..1 */
  at(t: number): { cue: Cue; local: number; p: number } | null {
    for (const cue of this.cues) {
      if (t >= cue.start && t < cue.end) return { cue, local: t - cue.start, p: (t - cue.start) / cue.dur };
    }
    const last = this.cues[this.cues.length - 1];
    if (last && t >= last.end) return { cue: last, local: last.dur, p: 1 };
    return null;
  }
  frameToTime(f: number) { return f / this.fps; }
  timeToFrame(t: number) { return Math.round(t * this.fps); }
}
