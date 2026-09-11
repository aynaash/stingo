import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { spawn } from 'bun';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Camera, parseVideo, TasteProfile } from '@stingo/schema';
import { cameraPlacement, contentRect, cameraMask, makeStage, substage } from '@stingo/blocks';
import { composite } from '@stingo/render';
import { blendUnder, flattenOnto, VideoSource, probeVideo } from '@stingo/media';
import { plan, estimateDuration } from '@stingo/film';

const taste = TasteProfile.parse({});
const stage = makeStage(1080, 1920, taste);
const cam = (o: Record<string, unknown> = {}) => Camera.parse({ src: 'take.mp4', ...o });

describe('placement', () => {
  test('full covers the canvas', () => {
    const p = cameraPlacement(cam({ layout: 'full' }), stage, taste);
    expect(p).toMatchObject({ x: 0, y: 0, w: 1080, h: 1920 });
  });

  test('split reserves one side and leaves the rest for content', () => {
    const p = cameraPlacement(cam({ layout: 'split', side: 'left', ratio: 0.4 }), stage, taste);
    expect(p.x).toBe(0);
    expect(p.w).toBe(432);
    expect(p.h).toBe(1920);
    const r = contentRect(cam({ layout: 'split', side: 'left', ratio: 0.4 }), stage)!;
    expect(r).toMatchObject({ x: 432, y: 0, w: 648, h: 1920 });
    // the two regions tile the canvas exactly, with no seam and no overlap
    expect(p.w + r.w).toBe(1080);
  });

  test('split on the bottom offsets the camera, not the content', () => {
    const c = cam({ layout: 'split', side: 'bottom', ratio: 0.3 });
    const p = cameraPlacement(c, stage, taste);
    const r = contentRect(c, stage)!;
    expect(p.y).toBe(1920 - p.h);
    expect(r).toMatchObject({ x: 0, y: 0, w: 1080 });
    expect(r.h + p.h).toBe(1920);
  });

  test('pip sits in the requested corner, inside the margin', () => {
    const c = cam({ layout: 'pip', corner: 'tl', size: 0.3, margin: 0.05, shape: 'rounded' });
    const p = cameraPlacement(c, stage, taste);
    expect(p.x).toBe(54);
    expect(p.y).toBe(54);
    expect(p.w).toBe(324);
    const br = cameraPlacement(cam({ layout: 'pip', corner: 'br', size: 0.3, margin: 0.05 }), stage, taste);
    expect(br.x + br.w).toBe(1080 - 54);
    expect(br.y + br.h).toBe(1920 - 54);
  });

  test('a circular pip is square with a half-width radius', () => {
    const p = cameraPlacement(cam({ layout: 'pip', shape: 'circle', size: 0.4 }), stage, taste);
    expect(p.w).toBe(p.h);
    expect(p.rx).toBe(p.w / 2);
  });

  test('every box has even dimensions — odd sizes break ffmpeg scalers', () => {
    for (const size of [0.11, 0.23, 0.37, 0.41, 0.59]) {
      const p = cameraPlacement(cam({ layout: 'pip', size, aspect: 1.37 }), stage, taste);
      expect(p.w % 2).toBe(0);
      expect(p.h % 2).toBe(0);
    }
  });

  test('only split reserves content space', () => {
    expect(contentRect(cam({ layout: 'full' }), stage)).toBeNull();
    expect(contentRect(cam({ layout: 'pip' }), stage)).toBeNull();
  });
});

describe('substage', () => {
  test('keeps the canvas type scale so panels match full-frame scenes', () => {
    const half = substage(stage, 540, 1920);
    expect(half.unit).toBe(stage.unit);
    expect(half.w).toBe(540);
    expect(half.contentW).toBe(540 - half.padX * 2);
  });
});

describe('masking and z-order', () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect id="body"/></svg>';

  test('the mask punches a hole the size of the placement', () => {
    const p = cameraPlacement(cam({ layout: 'pip', corner: 'tl' }), stage, taste);
    const m = cameraMask(p, 1080, 1920, 'cam');
    expect(m).toContain('<mask id="cam"');
    expect(m).toContain('<rect width="1080" height="1920" fill="#fff"/>');
    expect(m).toContain(`x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}"`);
  });

  test('a circular pip masks with a circle, not a rounded rect', () => {
    const p = cameraPlacement(cam({ layout: 'pip', shape: 'circle' }), stage, taste);
    expect(cameraMask(p, 1080, 1920)).toContain('<circle');
  });

  test('pip masks the block content, so the inset sits over it', () => {
    const out = composite(svg, { behind: '<rect id="bg"/>', mask: { id: 'cam', body: true } });
    expect(out).toContain('<g mask="url(#cam)"><rect id="bg"/></g>');
    expect(out).toContain('<g mask="url(#cam)"><rect id="body"/></g>');
  });

  test('full masks only the background, so captions stay over the take', () => {
    const out = composite(svg, { behind: '<rect id="bg"/>', mask: { id: 'cam', body: false } });
    expect(out).toContain('<g mask="url(#cam)"><rect id="bg"/></g>');
    expect(out).toContain('<rect id="body"/>');
    expect(out).not.toContain('<g mask="url(#cam)"><rect id="body"/></g>');
  });

  test('the front layer is never masked — chrome must survive the hole', () => {
    const out = composite(svg, { infront: '<circle id="ring"/>', mask: { id: 'cam', body: true } });
    expect(out).toContain('<circle id="ring"/>');
    expect(out.indexOf('<circle id="ring"/>')).toBeGreaterThan(out.indexOf('<rect id="body"/>'));
  });

  test('with no camera, nothing is wrapped', () => {
    const out = composite(svg, { behind: '<rect id="bg"/>' });
    expect(out).not.toContain('mask=');
  });
});

describe('blending', () => {
  const px = (vals: number[]) => Buffer.from(Uint8Array.from(vals));

  test('an opaque frame pixel is untouched', () => {
    const frame = px([10, 20, 30, 255]);
    blendUnder(frame, 1, 1, px([200, 200, 200, 255]), 1, 1, 0, 0);
    expect([...frame]).toEqual([10, 20, 30, 255]);
  });

  test('a transparent hole takes the layer exactly', () => {
    const frame = px([0, 0, 0, 0]);
    blendUnder(frame, 1, 1, px([200, 100, 50, 255]), 1, 1, 0, 0);
    expect([...frame]).toEqual([200, 100, 50, 255]);
  });

  test('premultiplied source-over: half-covered blends half the layer', () => {
    // the SVG left a 50%-alpha edge pixel; premultiplied, that is [64,64,64,128]
    const frame = px([64, 64, 64, 128]);
    blendUnder(frame, 1, 1, px([200, 200, 200, 255]), 1, 1, 0, 0);
    expect(frame[3]).toBe(255);
    expect(frame[0]).toBe(64 + Math.round((200 * 127) / 255));
  });

  test('a zero mask leaves the frame alone', () => {
    const frame = px([0, 0, 0, 0]);
    blendUnder(frame, 1, 1, px([200, 100, 50, 255]), 1, 1, 0, 0, Uint8Array.from([0]));
    expect([...frame]).toEqual([0, 0, 0, 0]);
  });

  test('the layer is clipped to the frame, never written out of bounds', () => {
    const frame = Buffer.alloc(2 * 2 * 4);
    const layer = Buffer.alloc(2 * 2 * 4, 255);
    blendUnder(frame, 2, 2, layer, 2, 2, 1, 1);
    expect([...frame.subarray(12, 16)]).toEqual([255, 255, 255, 255]);  // bottom-right only
    expect([...frame.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  });

  test('an off-frame layer is a no-op', () => {
    const frame = Buffer.alloc(4);
    blendUnder(frame, 1, 1, Buffer.alloc(4, 255), 1, 1, 5, 5);
    expect([...frame]).toEqual([0, 0, 0, 0]);
  });

  test('flattening makes every pixel opaque', () => {
    const frame = px([0, 0, 0, 0, 10, 10, 10, 255]);
    flattenOnto(frame, 2, [13, 11, 20]);
    expect([...frame.subarray(0, 4)]).toEqual([13, 11, 20, 255]);
    expect([...frame.subarray(4, 8)]).toEqual([10, 10, 10, 255]);
  });
});

describe('planning', () => {
  const doc = (scenes: unknown[]) => parseVideo({ title: 't', scenes });

  test('a camera scene runs as long as the take', () => {
    const d = doc([{ block: 'camera', camera: { src: '/take.mp4' } }]);
    const clips = new Map([['/take.mp4', 42]]);
    expect(estimateDuration(d.scenes[0]!, taste, undefined, clips)).toBeCloseTo(42, 3);
  });

  test('the in-point is subtracted from the take length', () => {
    const d = doc([{ block: 'camera', camera: { src: '/take.mp4', from: 10 } }]);
    expect(estimateDuration(d.scenes[0]!, taste, undefined, new Map([['/take.mp4', 42]]))).toBeCloseTo(32, 3);
  });

  test('take length overrides the pacing clamp — speech is not trimmed to fit', () => {
    const tight = TasteProfile.parse({ pacing: { sceneMax: 8 } });
    const d = doc([{ block: 'camera', camera: { src: '/take.mp4' } }]);
    expect(estimateDuration(d.scenes[0]!, tight, undefined, new Map([['/take.mp4', 60]]))).toBeCloseTo(60, 3);
  });

  test('an explicit dur still wins over the take length', () => {
    const d = doc([{ block: 'camera', dur: '5s', camera: { src: '/take.mp4' } }]);
    expect(estimateDuration(d.scenes[0]!, taste, undefined, new Map([['/take.mp4', 42]]))).toBeCloseTo(5, 3);
  });

  test('camera scenes cut free, so a downbeat never clips a word', () => {
    const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };
    const bars = TasteProfile.parse({ pacing: { cutOn: 'bar' } });
    const d = doc([{ block: 'camera', camera: { src: '/take.mp4' } }]);
    const { timeline } = plan(d, bars, grid, new Map([['/take.mp4', 9.37]]));
    expect(timeline.cues[0]!.dur).toBeCloseTo(9.37, 2);
  });

  test('a scene can opt back into snapping', () => {
    const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };   // a bar is 2s
    const bars = TasteProfile.parse({ pacing: { cutOn: 'bar' } });
    const d = doc([{ block: 'camera', cut: 'bar', camera: { src: '/take.mp4' } }]);
    const { timeline } = plan(d, bars, grid, new Map([['/take.mp4', 9.37]]));
    expect(timeline.cues[0]!.end % 2).toBeCloseTo(0, 5);
  });

  test('a missing take falls back to the block default instead of throwing', () => {
    const d = doc([{ block: 'camera', camera: { src: '/gone.mp4' } }]);
    expect(estimateDuration(d.scenes[0]!, taste, undefined, new Map())).toBeGreaterThan(0);
  });

  test('camera on a normal block leaves that block’s own pacing alone', () => {
    const withCam = doc([{ block: 'list', items: ['a', 'b'], camera: { src: '/take.mp4', layout: 'pip' } }]);
    const without = doc([{ block: 'list', items: ['a', 'b'] }]);
    const clips = new Map([['/take.mp4', 300]]);
    expect(estimateDuration(withCam.scenes[0]!, taste, undefined, clips))
      .toBeCloseTo(estimateDuration(without.scenes[0]!, taste, undefined, clips), 5);
  });
});

describe('schema', () => {
  test('a bare src is enough — everything else has a default', () => {
    const c = Camera.parse({ src: 'a.mp4' });
    expect(c).toMatchObject({ layout: 'full', fit: 'cover', zoom: 1, mirror: false, ring: true, mute: false });
  });

  test('camera is available on any block, not just the camera block', () => {
    const d = parseVideo({ title: 't', scenes: [{ block: 'code', code: 'x', camera: { src: 'a.mp4', layout: 'pip' } }] });
    expect(d.scenes[0]!.camera?.layout).toBe('pip');
  });

  test('the camera block requires a source', () => {
    expect(() => parseVideo({ title: 't', scenes: [{ block: 'camera' }] })).toThrow();
  });

  test('out-of-range framing is rejected rather than silently clamped', () => {
    expect(() => Camera.parse({ src: 'a.mp4', ratio: 0.95 })).toThrow();
    expect(() => Camera.parse({ src: 'a.mp4', zoom: 0.5 })).toThrow();
  });
});

describe('VideoSource', () => {
  let dir = '';
  let clip = '';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'stingo-cam-'));
    clip = join(dir, 'clip.mp4');
    // 3 seconds, one flat colour per second, so a decoded frame identifies its
    // own timestamp: red 0-1s, green 1-2s, blue 2-3s
    const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
      '-f', 'lavfi', '-i', 'color=c=red:s=320x240:r=30:d=1',
      '-f', 'lavfi', '-i', 'color=c=lime:s=320x240:r=30:d=1',
      '-f', 'lavfi', '-i', 'color=c=blue:s=320x240:r=30:d=1',
      '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]', '-map', '[v]',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '15', '-pix_fmt', 'yuv420p', clip],
      { stdout: 'pipe', stderr: 'pipe' });
    await p.exited;
  });

  afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

  const dominant = (px: Buffer) => {
    const [r, g, b] = [px[0]!, px[1]!, px[2]!];
    return r > g && r > b ? 'red' : g > r && g > b ? 'green' : 'blue';
  };

  test('probe reports real dimensions and duration', async () => {
    const m = await probeVideo(clip);
    expect(m.width).toBe(320);
    expect(m.height).toBe(240);
    expect(m.duration).toBeCloseTo(3, 1);
    expect(m.hasAudio).toBe(false);
  });

  test('probing a missing file names the file', async () => {
    await expect(probeVideo(join(dir, 'nope.mp4'))).rejects.toThrow(/not found/);
  });

  test('frames come back at the requested size', async () => {
    const s = await VideoSource.open(clip, 30);
    const px = await s.at(0.5, { w: 64, h: 48 });
    expect(px.byteLength).toBe(64 * 48 * 4);
    await s.close();
  });

  test('time maps to the right frame', async () => {
    const s = await VideoSource.open(clip, 30);
    expect(dominant(await s.at(0.5, { w: 32, h: 24 }))).toBe('red');
    expect(dominant(await s.at(1.5, { w: 32, h: 24 }))).toBe('green');
    expect(dominant(await s.at(2.5, { w: 32, h: 24 }))).toBe('blue');
    await s.close();
  });

  test('seeking backwards works and costs a restart', async () => {
    const s = await VideoSource.open(clip, 30);
    await s.at(2.5, { w: 32, h: 24 });
    const before = s.stats.restarts;
    expect(dominant(await s.at(0.5, { w: 32, h: 24 }))).toBe('red');
    expect(s.stats.restarts).toBe(before + 1);
    await s.close();
  });

  test('a sweep forward stays on one decoder process', async () => {
    const s = await VideoSource.open(clip, 30);
    await s.at(0, { w: 32, h: 24 });
    const before = s.stats.restarts;
    for (let f = 1; f < 60; f++) await s.at(f / 30, { w: 32, h: 24 });
    expect(s.stats.restarts).toBe(before);
    await s.close();
  });

  test('asking for the same frame twice decodes once', async () => {
    const s = await VideoSource.open(clip, 30);
    await s.at(1.5, { w: 32, h: 24 });
    const before = s.stats.decoded;
    await s.at(1.5, { w: 32, h: 24 });
    expect(s.stats.decoded).toBe(before);
    await s.close();
  });

  test('past the end, the last frame holds instead of failing', async () => {
    const s = await VideoSource.open(clip, 30);
    const px = await s.at(99, { w: 32, h: 24 });
    expect(px.byteLength).toBe(32 * 24 * 4);
    await s.close();
  });

  test('a closed source refuses further reads', async () => {
    const s = await VideoSource.open(clip, 30);
    await s.close();
    await expect(s.at(0, { w: 32, h: 24 })).rejects.toThrow(/closed/);
  });

  test('mirroring flips the frame horizontally', async () => {
    const s = await VideoSource.open(clip, 30);
    const box = { w: 32, h: 24 };
    const plain = await s.at(0.5, box);
    const flipped = await s.at(0.5, box, { fit: 'cover', zoom: 1, offsetX: 0, offsetY: 0, mirror: true });
    expect(plain.byteLength).toBe(flipped.byteLength);
    await s.close();
  });
});

describe('builder', () => {
  test('camera() makes a camera scene', async () => {
    const { film, camera } = await import('stingo');
    const doc = film('t').add(camera('take.mp4', { layout: 'full' }).lower('Hersi', 'building stingo')).toDoc();
    expect(doc.scenes[0]).toMatchObject({ block: 'camera', lower: { name: 'Hersi', role: 'building stingo' } });
    expect(doc.scenes[0]!.camera?.src).toBe('take.mp4');
  });

  test('.camera() composites a take onto any other block', async () => {
    const { film, code } = await import('stingo');
    const doc = film('t').add(code('go', 'x := 1').camera('take.mp4', { layout: 'pip', corner: 'tl' })).toDoc();
    expect(doc.scenes[0]!.block).toBe('code');
    expect(doc.scenes[0]!.camera).toMatchObject({ layout: 'pip', corner: 'tl' });
  });

  test('.from() and .frame() reframe without dropping the source', async () => {
    const { film, camera } = await import('stingo');
    const doc = film('t').add(camera('take.mp4').from('8b').frame({ zoom: 1.4, mirror: true })).toDoc();
    expect(doc.scenes[0]!.camera).toMatchObject({ src: 'take.mp4', from: '8b', zoom: 1.4, mirror: true });
  });

  test('.cut() overrides the taste snapping', async () => {
    const { film, camera } = await import('stingo');
    expect(film('t').add(camera('a.mp4').cut('bar')).toDoc().scenes[0]!.cut).toBe('bar');
  });
});
