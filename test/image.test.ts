import { expect, test, describe } from 'bun:test';
import '@stingo/blocks';
import { parseVideo, hasBlock, blockDuration } from '@stingo/schema';
import { imageInfo, fitBox } from '@stingo/blocks';
import { Film } from '@stingo/film';
import { THEMES } from '@stingo/themes';
import { image, film } from '@hersidev/stingo';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };
let dir = '';
let png = '';

/** Memoise the PROMISE, not a flag.
 *
 *  Guarding on `if (dir) return` looked fine and was a race: `dir` is assigned
 *  before ffmpeg has finished writing, so a second concurrent caller returned
 *  early and read a file that did not exist yet. It passed locally on timing
 *  luck and failed on CI. */
let ready: Promise<void> | null = null;

function fixtures(): Promise<void> {
  ready ??= (async () => {
    dir = await mkdtemp(join(tmpdir(), 'stingo-img-'));
    png = join(dir, 'a.png');
    // a real 4x3 PNG, written by ffmpeg so the header is genuine
    const p = Bun.spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:s=4x3', '-frames:v', '1', png], { stderr: 'pipe' });
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0) throw new Error(`fixture render failed: ${err}`);
    if (!(await Bun.file(png).exists())) throw new Error(`fixture was not written: ${png}`);
  })();
  return ready;
}

describe('image header parsing', () => {
  test('reads PNG dimensions without decoding the file', async () => {
    await fixtures();
    const i = imageInfo(png);
    expect(i.width).toBe(4);
    expect(i.height).toBe(3);
    expect(i.mime).toBe('image/png');
    expect(i.dataUri.startsWith('data:image/png;base64,')).toBe(true);
  });

  test('reads SVG dimensions from width/height or viewBox', async () => {
    await fixtures();
    const a = join(dir, 'wh.svg');
    await writeFile(a, '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"></svg>');
    expect(imageInfo(a)).toMatchObject({ width: 120, height: 60 });
    const b = join(dir, 'vb.svg');
    await writeFile(b, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"></svg>');
    expect(imageInfo(b)).toMatchObject({ width: 200, height: 50 });
  });

  test('a missing file fails with the path in the message', () => {
    expect(() => imageInfo('/no/such/file.png')).toThrow(/image not found/);
  });

  test('an unreadable format fails clearly rather than guessing', async () => {
    await fixtures();
    const bad = join(dir, 'bad.png');
    await writeFile(bad, 'not actually a png');
    expect(() => imageInfo(bad)).toThrow(/could not read the dimensions/);
  });
});

describe('fitBox', () => {
  test('contain fits inside the box', () => {
    expect(fitBox({ width: 1920, height: 1080 }, { w: 500, h: 500 }, 'contain')).toEqual({ w: 500, h: 281.25 });
  });
  test('cover fills the box', () => {
    const r = fitBox({ width: 1920, height: 1080 }, { w: 500, h: 500 }, 'cover');
    expect(r.w).toBeGreaterThanOrEqual(500);
    expect(r.h).toBeGreaterThanOrEqual(500);
  });
  test('a square source into a square box is unchanged', () => {
    expect(fitBox({ width: 100, height: 100 }, { w: 300, h: 300 }, 'contain')).toEqual({ w: 300, h: 300 });
  });
});

describe('image block', () => {
  test('is registered', () => {
    expect(hasBlock('image')).toBe(true);
    expect(blockDuration('image').base).toBe(5);
  });

  test('renders through the pipeline in both orientations', async () => {
    await fixtures();
    for (const canvas of [{ width: 300, height: 533, fps: 30 }, { width: 533, height: 300, fps: 30 }]) {
      const doc = parseVideo({ canvas, scenes: [{ block: 'image', src: png, frame: 'window', caption: 'c' }] });
      const f = await Film.create({ doc, taste: THEMES.bootdev, grid });
      expect((await f.framePixels(15)).byteLength).toBe(canvas.width * canvas.height * 4);
    }
  }, 40000);

  test('a missing image fails at render with a clear message', async () => {
    const doc = parseVideo({ canvas: { width: 200, height: 200, fps: 30 }, scenes: [{ block: 'image', src: '/no/such.png' }] });
    const f = await Film.create({ doc, taste: THEMES.bootdev, grid });
    await expect(f.framePixels(5)).rejects.toThrow(/image not found/);
  }, 20000);

  test('the builder matches the YAML form', async () => {
    await fixtures();
    const built = film('t').canvas(300, 533).add(
      image(png).window('shot.png').caption('a caption').contain().drift(0.08),
    ).toDoc();
    const yaml = parseVideo({
      canvas: { width: 300, height: 533, fps: 30 },
      scenes: [{ block: 'image', src: png, frame: 'window', title: 'shot.png', caption: 'a caption', fit: 'contain', drift: 0.08 }],
    });
    expect(built.scenes[0]).toEqual(yaml.scenes[0] as any);
  });
});
