import { expect, test, describe } from 'bun:test';
import '@stingo/blocks';
import { parseVideo } from '@stingo/schema';
import { plan, captionCues, captionAt, toSrt, toVtt, Film } from '@stingo/film';
import { THEMES } from '@stingo/themes';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };
const build = (scenes: any[], canvas: any = { preset: 'vertical', fps: 30 }) => {
  const doc = parseVideo({ title: 't', canvas, captions: { enabled: true }, scenes });
  const { timeline } = plan(doc, THEMES.bootdev, grid);
  return { doc, timeline, cues: captionCues(doc, timeline, THEMES.bootdev) };
};

const SAY = 'Your program is waiting. Most of the time, it is doing nothing at all.';

describe('caption timing', () => {
  test('produces cues only for scenes that carry narration', () => {
    const { cues } = build([
      { block: 'title', text: 'a', say: SAY },
      { block: 'statement', text: 'no narration here' },
    ]);
    expect(cues.length).toBeGreaterThan(0);
    expect(new Set(cues.map((c) => c.sceneIndex))).toEqual(new Set([0]));
  });

  test('every word of the narration survives into the cues', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: SAY }]);
    const words = cues.flatMap((c) => c.words.map((w) => w.text));
    expect(words.join(' ')).toBe(SAY);
  });

  test('cues never overlap and are never zero-length', () => {
    const { cues } = build([
      { block: 'title', text: 'a', say: SAY },
      { block: 'statement', text: 'b', say: 'Waiting is not working, and it never was.' },
    ]);
    for (let i = 0; i < cues.length; i++) {
      expect(cues[i]!.end, `cue ${i} length`).toBeGreaterThan(cues[i]!.start);
      if (i > 0) expect(cues[i - 1]!.end, `cue ${i - 1} overlaps ${i}`).toBeLessThanOrEqual(cues[i]!.start + 1e-9);
    }
  });

  test('captions stay inside their scene', () => {
    const { timeline, cues } = build([
      { block: 'title', text: 'a', say: SAY },
      { block: 'statement', text: 'b', say: 'Short one.' },
    ]);
    for (const c of cues) {
      const cue = timeline.cues[c.sceneIndex]!;
      expect(c.start).toBeGreaterThanOrEqual(cue.start);
      expect(c.end).toBeLessThanOrEqual(cue.end + 1e-9);
    }
  });

  test('longer words are given more time than short ones', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: 'a extraordinarily b' }]);
    const [w1, w2, w3] = cues[0]!.words;
    const dur = (w: any) => w.end - w.start;
    expect(dur(w2!)).toBeGreaterThan(dur(w1!));
    expect(dur(w2!)).toBeGreaterThan(dur(w3!));
  });

  test('breaks lines at sentence endings', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: 'One two. Three four five six seven.' }]);
    expect(cues[0]!.words.map((w) => w.text).join(' ')).toBe('One two.');
  });

  test('portrait shows fewer words at once than landscape', () => {
    const p = build([{ block: 'title', text: 'a', say: SAY }], { preset: 'vertical', fps: 30 });
    const l = build([{ block: 'title', text: 'a', say: SAY }], { preset: 'horizontal', fps: 30 });
    const widest = (c: any[]) => Math.max(...c.map((x) => x.words.length));
    expect(widest(p.cues)).toBeLessThan(widest(l.cues));
  });
});

describe('captionAt', () => {
  test('tracks which word is being said', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: SAY }]);
    const first = cues[0]!;
    expect(captionAt(cues, first.start + 0.001)!.wordIndex).toBe(0);
    const last = first.words[first.words.length - 1]!;
    expect(captionAt(cues, last.start + (last.end - last.start) / 2)!.wordIndex).toBe(first.words.length - 1);
  });

  test('returns nothing in a gap', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: 'Hi.' }]);
    expect(captionAt(cues, cues[cues.length - 1]!.end + 5)).toBeNull();
  });
});

describe('sidecar formats', () => {
  test('SRT is numbered, comma-separated and in order', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: SAY }]);
    const srt = toSrt(cues);
    expect(srt.startsWith('1\n00:00:00,120 --> ')).toBe(true);
    expect(srt).toContain('Your program is waiting.');
    const stamps = [...srt.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g)];
    expect(stamps.length).toBe(cues.length);
    for (const [, a, b] of stamps) expect(a! < b!).toBe(true);
  });

  test('VTT carries per-word timing for highlighting', () => {
    const { cues } = build([{ block: 'title', text: 'a', say: SAY }]);
    const vtt = toVtt(cues);
    expect(vtt.startsWith('WEBVTT')).toBe(true);
    expect(vtt).toMatch(/<\d{2}:\d{2}:\d{2}\.\d{3}>/);
  });
});

describe('burned-in captions', () => {
  test('a captioned frame differs from the same frame uncaptioned', async () => {
    const scenes = [{ block: 'title', text: 'Hello', say: SAY }];
    const canvas = { width: 300, height: 533, fps: 30 };
    const on = parseVideo({ canvas, captions: { enabled: true }, scenes });
    const off = parseVideo({ canvas, captions: { enabled: false }, scenes });
    const fOn = await Film.create({ doc: on, taste: THEMES.bootdev, grid, hud: false });
    const fOff = await Film.create({ doc: off, taste: THEMES.bootdev, grid, hud: false });
    expect(fOn.captions).not.toBeNull();
    expect(fOff.captions).toBeNull();
    expect(Buffer.compare(await fOn.framePixels(30), await fOff.framePixels(30))).not.toBe(0);
  }, 40000);

  test('no narration means no caption track, not a crash', async () => {
    const doc = parseVideo({
      canvas: { width: 300, height: 533, fps: 30 },
      captions: { enabled: true },
      scenes: [{ block: 'title', text: 'silent' }],
    });
    const f = await Film.create({ doc, taste: THEMES.bootdev, grid });
    expect(f.captions).toEqual([]);
    expect((await f.framePixels(10)).byteLength).toBe(300 * 533 * 4);
  }, 30000);
});
