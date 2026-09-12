import { expect, test, describe } from 'bun:test';
import '@stingo/blocks';
import { Broll, parseVideo } from '@stingo/schema';
import { Film, backdropTime, backdropFraming } from '@stingo/film';
import { THEMES } from '@stingo/themes';
import { film, title } from '@hersidev/stingo';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };
const STILL = '.stingo/gallery/block-diagram.png';
const CLIP = '.stingo/gallery/standin.mp4';

describe('the bg field', () => {
  test('stays procedural when no src is given', () => {
    const b = Broll.parse({ kind: 'grid', opacity: 0.4 });
    expect(b.src).toBeUndefined();
    expect(b.kind).toBe('grid');
  });

  test('accepts media, with a scrim on by default', () => {
    const b = Broll.parse({ src: './clip.mp4' });
    expect(b.src).toBe('./clip.mp4');
    expect(b.scrim).toBeGreaterThan(0.4);   // readable unless you opt out
    expect(b.loop).toBe(true);
    expect(b.fit).toBe('cover');
  });

  test('rejects framing values that cannot mean anything', () => {
    expect(() => Broll.parse({ src: 'a.mp4', scrim: 5 })).toThrow();
    expect(() => Broll.parse({ src: 'a.mp4', zoom: 0 })).toThrow();
    expect(() => Broll.parse({ src: 'a.mp4', offsetX: 2 })).toThrow();
    expect(() => Broll.parse({ src: 'a.mp4', fit: 'squish' })).toThrow();
  });

  test('the builder writes the same thing as YAML', () => {
    const built = film('t').add(title('x').backdrop('./clip.mp4', { scrim: 0.7, from: '2s' })).toDoc();
    const yaml = parseVideo({ scenes: [{ block: 'title', text: 'x', bg: { src: './clip.mp4', scrim: 0.7, from: '2s' } }] });
    expect(built.scenes[0]!.bg).toEqual(yaml.scenes[0]!.bg as any);
  });
});

describe('backdropTime', () => {
  const cfg = (o: any) => Broll.parse({ src: 'a.mp4', ...o });

  test('starts at the in-point', () => {
    expect(backdropTime(cfg({ from: '2s' }), 0, grid, 10)).toBe(2);
  });

  test('loops the portion after the in-point', () => {
    const c = cfg({ from: '2s', loop: true });
    expect(backdropTime(c, 5, grid, 10)).toBeCloseTo(7, 5);
    // 8s of scene over an 8s usable span wraps back to the in-point
    expect(backdropTime(c, 8.1, grid, 10)).toBeCloseTo(2.1, 5);
  });

  test('holds instead of looping when asked', () => {
    expect(backdropTime(cfg({ from: '2s', loop: false }), 20, grid, 10)).toBe(22);
  });

  test('a still never loops, whatever the flag says', () => {
    // a picture reports no duration; VideoSource holds its only frame
    expect(backdropTime(cfg({ loop: true }), 20, grid, 0)).toBe(20);
  });

  test('framing is passed through verbatim', () => {
    const c = cfg({ fit: 'contain', zoom: 2, offsetX: -0.3, mirror: true });
    expect(backdropFraming(c)).toEqual({ fit: 'contain', zoom: 2, offsetX: -0.3, offsetY: 0, mirror: true });
  });
});

describe('rendering a media backdrop', () => {
  const doc = (bg: any, canvas = { width: 240, height: 426, fps: 30 }) =>
    parseVideo({ canvas, scenes: [{ block: 'title', text: 'over media', dur: '4s', bg }] });

  test('a still shows through instead of the painted ground', async () => {
    if (!(await Bun.file(STILL).exists())) return;   // written by tools/gallery.ts
    const plain = await Film.create({ doc: { ...doc({ kind: 'none', opacity: 0 }) } as any, taste: THEMES.bootdev, grid, hud: false });
    const media = await Film.create({ doc: doc({ src: STILL, scrim: 0 }), taste: THEMES.bootdev, grid, hud: false });
    const a = await plain.framePixels(30);
    const b = await media.framePixels(30);
    expect(Buffer.compare(a, b), 'the backdrop changed nothing').not.toBe(0);
    await media.close?.(); await plain.close?.();
  }, 40000);

  test('the scrim darkens it, and more scrim is darker', async () => {
    if (!(await Bun.file(STILL).exists())) return;
    const mean = (px: Buffer) => {
      let t = 0;
      for (let i = 0; i < px.length; i += 4) t += px[i]! + px[i + 1]! + px[i + 2]!;
      return t / ((px.length / 4) * 3);
    };
    const at = 30;
    const none = await (await Film.create({ doc: doc({ src: STILL, scrim: 0 }), taste: THEMES.bootdev, grid, hud: false })).framePixels(at);
    const half = await (await Film.create({ doc: doc({ src: STILL, scrim: 0.5 }), taste: THEMES.bootdev, grid, hud: false })).framePixels(at);
    const full = await (await Film.create({ doc: doc({ src: STILL, scrim: 1 }), taste: THEMES.bootdev, grid, hud: false })).framePixels(at);
    expect(mean(half)).toBeLessThan(mean(none));
    expect(mean(full)).toBeLessThan(mean(half));
  }, 60000);

  test('a clip backdrop advances with the scene', async () => {
    if (!(await Bun.file(CLIP).exists())) return;
    const f = await Film.create({ doc: doc({ src: CLIP, scrim: 0 }), taste: THEMES.bootdev, grid, hud: false });
    expect(Buffer.compare(await f.framePixels(5), await f.framePixels(100))).not.toBe(0);
    await f.close?.();
  }, 40000);

  test('the frame is left opaque for the encoder', async () => {
    if (!(await Bun.file(STILL).exists())) return;
    const f = await Film.create({ doc: doc({ src: STILL, fit: 'contain' }), taste: THEMES.bootdev, grid, hud: false });
    const px = await f.framePixels(30);
    let transparent = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i]! < 255) transparent++;
    expect(transparent, 'letterboxed edges left holes in the frame').toBe(0);
    await f.close?.();
  }, 40000);

  test('a missing file fails with the path in the message', async () => {
    const f = await Film.create({ doc: doc({ src: '/no/such/clip.mp4' }), taste: THEMES.bootdev, grid, hud: false });
    await expect(f.framePixels(10)).rejects.toThrow(/no\/such\/clip\.mp4/);
  }, 30000);
});
