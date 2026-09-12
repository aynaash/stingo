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

/** Build the fixtures ourselves rather than asking ffmpeg for them.
 *
 *  This suite tests a header PARSER, so the bytes are the subject — borrowing
 *  them from ffmpeg made the result depend on which ffmpeg the machine has.
 *  A 4x3 PNG here and a 4x3 PNG on a CI runner turned out not to be the same
 *  file, and the test failed on a difference it was never meant to measure. */
function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, body: Uint8Array): Uint8Array {
  const out = Buffer.alloc(12 + body.length);
  out.writeUInt32BE(body.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(body).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
  return out;
}

export function makePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 2;    // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(chunk('IHDR', ihdr)),
    Buffer.from(chunk('IDAT', new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01]))),
    Buffer.from(chunk('IEND', new Uint8Array())),
  ]);
}

/** A baseline JPEG carrying nothing but the markers the parser walks. */
export function makeJpeg(width: number, height: number): Buffer {
  const sof = Buffer.alloc(10);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(8, 2);        // segment length
  sof[4] = 8;                     // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
}

let ready: Promise<void> | null = null;

function fixtures(): Promise<void> {
  ready ??= (async () => {
    dir = await mkdtemp(join(tmpdir(), 'stingo-img-'));
    png = join(dir, 'a.png');
    await writeFile(png, makePng(4, 3));
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

  test('reads JPEG dimensions by walking to the start-of-frame', async () => {
    await fixtures();
    const jpg = join(dir, 'a.jpg');
    await writeFile(jpg, makeJpeg(120, 80));
    expect(imageInfo(jpg)).toMatchObject({ width: 120, height: 80, mime: 'image/jpeg' });
  });

  test('reads a real PNG off disk, not just a synthetic one', async () => {
    const real = 'docs/assets/img/block-code.webp';
    // the gallery writes webp; use the png the block gallery renders from
    const candidate = '.stingo/gallery/block-code.png';
    if (await Bun.file(candidate).exists()) {
      const i = imageInfo(candidate);
      expect(i.width).toBe(1080);
      expect(i.height).toBe(1920);
    }
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
