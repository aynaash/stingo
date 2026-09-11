import type { VideoDoc, TasteProfile, Scene } from '@stingo/schema';
import type { Timeline } from '@stingo/core';

/** Captions from the narration already in the script.
 *
 *  Every scene can carry `say`, which already sets the scene's length. The same
 *  text becomes the caption track: words are spread across the scene at the
 *  taste's speaking rate, then grouped into short chunks.
 *
 *  This is estimated timing, not forced alignment. Against a real recorded take
 *  it will drift; against TTS generated from the same text it will not, which is
 *  the direction the roadmap goes. Where a take's own transcript exists, it
 *  should replace this — the shape of a cue is the same either way. */

export interface CaptionWord { text: string; start: number; end: number }
export interface CaptionCue {
  /** absolute seconds */
  start: number;
  end: number;
  words: CaptionWord[];
  sceneIndex: number;
}

/** Longer words take longer to say. Weighting by length plus a floor tracks
 *  speech far better than dividing the time equally. */
const weight = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '').length + 2.2;

/** Break a line where a listener would: after sentence-ending punctuation
 *  first, then commas, then simply at the chunk size. */
function chunkWords(words: CaptionWord[], maxWords: number): CaptionWord[][] {
  const out: CaptionWord[][] = [];
  let cur: CaptionWord[] = [];
  for (const w of words) {
    cur.push(w);
    const hard = /[.!?]$/.test(w.text);
    const soft = /[,;:—]$/.test(w.text);
    if (hard || cur.length >= maxWords || (soft && cur.length >= Math.max(2, maxWords - 1))) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export interface CaptionOpts {
  /** words shown at once */
  maxWords?: number;
  /** seconds of lead-in before the first word of a scene */
  lead?: number;
}

/** Build the caption track for a planned film. */
export function captionCues(
  doc: VideoDoc, timeline: Timeline, taste: TasteProfile, opts: CaptionOpts = {},
): CaptionCue[] {
  const maxWords = opts.maxWords ?? (doc.canvas.orientation === 'portrait' ? 4 : 7);
  const lead = opts.lead ?? 0.12;
  const cues: CaptionCue[] = [];

  timeline.cues.forEach((cue) => {
    const scene = doc.scenes[cue.index] as Scene | undefined;
    const say = scene?.say?.trim();
    if (!say) return;

    const tokens = say.split(/\s+/).filter(Boolean);
    if (!tokens.length) return;

    // speak at the taste's rate, but never overrun the scene
    const natural = tokens.reduce((a, w) => a + weight(w), 0);
    const wanted = (tokens.length / taste.pacing.wordsPerMinute) * 60;
    const available = Math.max(0.4, cue.dur - lead - 0.1);
    const span = Math.min(wanted, available);

    let t = cue.start + lead;
    const words: CaptionWord[] = tokens.map((text) => {
      const d = (weight(text) / natural) * span;
      const w = { text, start: t, end: t + d };
      t += d;
      return w;
    });

    for (const group of chunkWords(words, maxWords)) {
      cues.push({
        start: group[0]!.start,
        // hold a little past the last word so it does not blink out mid-breath
        end: Math.min(cue.end, group[group.length - 1]!.end + 0.18),
        words: group,
        sceneIndex: cue.index,
      });
    }
  });

  // Close small gaps and, more importantly, remove overlaps: holding a cue past
  // its last word is good on screen but produces malformed SRT, which several
  // platforms reject outright.
  for (let i = 0; i < cues.length - 1; i++) {
    const here = cues[i]!, next = cues[i + 1]!;
    const gap = next.start - here.end;
    if (gap < 0) here.end = next.start;                                   // overlap
    else if (gap < 0.25 && next.sceneIndex === here.sceneIndex) here.end = next.start;  // flicker
    if (here.end <= here.start) here.end = here.start + 0.05;             // never zero-length
  }

  return cues;
}

/** The cue visible at time t, and which of its words is being said. */
export function captionAt(cues: CaptionCue[], t: number): { cue: CaptionCue; wordIndex: number } | null {
  // cues are ordered, so a linear scan from a hint would be faster; at a few
  // hundred cues this is not worth the state it would cost
  for (const cue of cues) {
    if (t >= cue.start && t < cue.end) {
      let wordIndex = cue.words.length - 1;
      for (let i = 0; i < cue.words.length; i++) {
        if (t < cue.words[i]!.end) { wordIndex = i; break; }
      }
      return { cue, wordIndex };
    }
  }
  return null;
}

const pad = (n: number, w = 2) => String(Math.floor(n)).padStart(w, '0');

function stamp(t: number, comma: boolean): string {
  const ms = Math.round((t % 1) * 1000);
  return `${pad(t / 3600)}:${pad((t / 60) % 60)}:${pad(t % 60)}${comma ? ',' : '.'}${pad(ms, 3)}`;
}

/** SubRip sidecar — what every platform accepts for upload. */
export function toSrt(cues: CaptionCue[]): string {
  return cues.map((c, i) =>
    `${i + 1}\n${stamp(c.start, true)} --> ${stamp(c.end, true)}\n${c.words.map((w) => w.text).join(' ')}\n`,
  ).join('\n');
}

/** WebVTT, with per-word timing so a player can highlight along. */
export function toVtt(cues: CaptionCue[]): string {
  const body = cues.map((c) => {
    const text = c.words
      .map((w, i) => (i === 0 ? w.text : `<${stamp(w.start, false)}>${w.text}`))
      .join(' ');
    return `${stamp(c.start, false)} --> ${stamp(c.end, false)}\n${text}\n`;
  }).join('\n');
  return `WEBVTT\n\n${body}`;
}
