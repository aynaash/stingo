import { expect, test, describe } from 'bun:test';
import { plan, estimateDuration, Film } from '@stingo/film';
import { parseVideo, TasteProfile } from '@stingo/schema';
import { THEMES } from '@stingo/themes';
import { makeStage, T } from '@stingo/blocks';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };   // bar = 2s
const doc = (scenes: any[], canvas: any = { preset: 'vertical', fps: 30 }) =>
  parseVideo({ title: 't', canvas, scenes });

describe('planner', () => {
  test('lays scenes end to end with no gaps', () => {
    const { timeline } = plan(doc([
      { block: 'title', text: 'a' }, { block: 'statement', text: 'b' }, { block: 'stat', value: '1', label: 'x' },
    ]), THEMES.bootdev, grid);
    for (let i = 1; i < timeline.cues.length; i++) {
      expect(timeline.cues[i]!.start).toBe(timeline.cues[i - 1]!.end);
    }
  });

  test('snaps every cut to a bar when cutOn is bar', () => {
    const { timeline } = plan(doc([
      { block: 'title', text: 'a' }, { block: 'code', lang: 'ts', code: 'a\nb\nc' }, { block: 'list', items: ['x', 'y'] },
    ]), THEMES.bootdev, grid);
    for (const c of timeline.cues) expect(c.end % 2, `${c.id} ends at ${c.end}`).toBeCloseTo(0, 6);
  });

  test('leaves cuts alone when cutOn is free', () => {
    // a 3-item list lands on its 7s block default — deliberately not a multiple
    // of the 2s bar, so snapping is observable
    const scenes = [{ block: 'list', items: ['a', 'b', 'c'] }];
    const free = TasteProfile.parse({ ...THEMES.bootdev, pacing: { ...THEMES.bootdev.pacing, cutOn: 'free' } });
    const loose = plan(doc(scenes), free, grid).timeline.cues[0]!;
    expect(loose.end).toBeCloseTo(7, 5);
    expect(loose.end % 2).not.toBeCloseTo(0, 6);

    // the same content with cutOn: bar must be pulled onto the grid
    const snapped = plan(doc(scenes), THEMES.bootdev, grid).timeline.cues[0]!;
    expect(snapped.end % 2).toBeCloseTo(0, 6);
  });

  test('honours an explicit duration', () => {
    const { timeline } = plan(doc([{ block: 'title', text: 'a', dur: '4bar' }]), THEMES.bootdev, grid);
    expect(timeline.cues[0]!.dur).toBeCloseTo(8, 6);
  });

  test('longer content earns a longer scene', () => {
    // the block default acts as a floor, so the contrast has to clear it
    const lines = (n: number) => Array.from({ length: n }, (_, i) => `line${i}`).join('\n');
    const short = estimateDuration(doc([{ block: 'code', lang: 'ts', code: lines(1) }]).scenes[0]!, THEMES.bootdev, grid);
    const long = estimateDuration(doc([{ block: 'code', lang: 'ts', code: lines(20) }]).scenes[0]!, THEMES.bootdev, grid);
    expect(long).toBeGreaterThan(short);
    expect(short).toBe(8);            // the code default
    expect(long).toBeCloseTo(10.2, 5); // 1.8 + 20 * 0.42
  });

  test('pacing bounds are respected', () => {
    const d = estimateDuration(doc([{ block: 'list', items: Array(40).fill('item') }]).scenes[0]!, THEMES.bootdev, grid);
    expect(d).toBeLessThanOrEqual(THEMES.bootdev.pacing.sceneMax);
  });

  test('warns about an overlapping explicit start', () => {
    const { warnings } = plan(doc([
      { block: 'title', text: 'a', dur: '4s' }, { block: 'title', text: 'b', at: '1s' },
    ]), THEMES.bootdev, grid);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/overlapping/);
  });
});

describe('stage', () => {
  test('adapts to orientation but keeps one type scale', () => {
    const p = makeStage(1080, 1920, THEMES.bootdev);
    const l = makeStage(1920, 1080, THEMES.bootdev);
    expect(p.orientation).toBe('portrait');
    expect(l.orientation).toBe('landscape');
    expect(p.splitDir).toBe('column');
    expect(l.splitDir).toBe('row');
    expect(p.unit).toBe(l.unit);                       // same shorter edge
    expect(T.display(p)).toBeGreaterThan(T.display(l)); // portrait sets bigger
  });
  test('content stays inside the safe column', () => {
    const s = makeStage(1080, 1920, THEMES.bootdev);
    expect(s.contentW).toBe(1080 - s.padX * 2);
    expect(s.padX).toBeGreaterThan(0);
  });
});

describe('Film', () => {
  test('renders deterministically — same frame, same bytes', async () => {
    const film = await Film.create({
      doc: doc([{ block: 'title', text: 'determinism', sub: 'same in, same out' }],
        { width: 240, height: 426, fps: 30 }),
      taste: THEMES.bootdev, grid,
    });
    const a = await film.framePixels(15);
    const b = await film.framePixels(15);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  test('adjacent frames differ — things actually move', async () => {
    const film = await Film.create({
      doc: doc([{ block: 'title', text: 'motion' }], { width: 240, height: 426, fps: 30 }),
      taste: THEMES.bootdev, grid,
    });
    expect(Buffer.compare(await film.framePixels(2), await film.framePixels(9))).not.toBe(0);
  });

  test('frame buffers are exactly w*h*4', async () => {
    const film = await Film.create({
      doc: doc([{ block: 'stat', value: '42', label: 'x' }], { width: 240, height: 426, fps: 30 }),
      taste: THEMES.bootdev, grid,
    });
    expect((await film.framePixels(5)).byteLength).toBe(240 * 426 * 4);
  });

  test('every block type renders without throwing', async () => {
    const scenes = [
      { block: 'title', text: 'a', kicker: 'k', sub: 's' },
      { block: 'statement', text: 'b c', emphasis: ['c'] },
      { block: 'code', lang: 'go', code: 'func main() {}' },
      { block: 'terminal', lines: [{ prompt: '$', cmd: 'ls', out: 'a\nb' }] },
      { block: 'stat', value: '1,234', label: 'x', sub: 'y' },
      { block: 'list', title: 't', items: ['a', 'b'], marker: 'check' },
      { block: 'chart', kind: 'bar', data: [{ label: 'a', value: 1 }, { label: 'b', value: 2 }] },
      { block: 'chart', kind: 'line', data: [{ label: 'a', value: 1 }, { label: 'b', value: 5 }, { label: 'c', value: 3 }] },
      { block: 'quote', text: 'q', attrib: 'someone' },
      { block: 'compare', left: { title: 'L', items: ['1'] }, right: { title: 'R', items: ['2'] } },
      { block: 'broll', caption: 'c' },
      { block: 'outro', text: 'bye', sub: 's', handle: '@x' },
    ];
    const film = await Film.create({
      doc: doc(scenes, { width: 240, height: 426, fps: 30 }), taste: THEMES.bootdev, grid,
    });
    for (const cue of film.timeline.cues) {
      const f = Math.round((cue.start + cue.dur / 2) * 30);
      expect(async () => await film.framePixels(f), cue.block).not.toThrow();
      expect((await film.framePixels(f)).byteLength).toBe(240 * 426 * 4);
    }
  }, 60000);

  test('renders in both orientations from one document', async () => {
    const scenes = [{ block: 'compare', left: { title: 'L', items: ['a', 'b'] }, right: { title: 'R', items: ['c'] } }];
    for (const canvas of [{ width: 240, height: 426, fps: 30 }, { width: 426, height: 240, fps: 30 }]) {
      const film = await Film.create({ doc: doc(scenes, canvas), taste: THEMES.bootdev, grid });
      expect((await film.framePixels(10)).byteLength).toBe(canvas.width * canvas.height * 4);
    }
  }, 30000);
});
