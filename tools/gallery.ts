#!/usr/bin/env bun
/** Generate every showcase image in the docs.
 *
 *  The gallery used to be hand-made PNGs, which meant it drifted the moment a
 *  block changed and silently advertised a version of stingo that no longer
 *  existed. This renders all of it from the real pipeline, so a screenshot in
 *  the docs is by construction what the current code produces.
 *
 *    bun run tools/gallery.ts            all of it
 *    bun run tools/gallery.ts blocks     just the block gallery
 */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'bun';
import '@stingo/blocks';
import { parseVideo, blockNames } from '@stingo/schema';
import { Film } from '@stingo/film';
import { THEMES, derive } from '@stingo/themes';

const OUT = 'docs/assets/img';
const TMP = '.stingo/gallery';
const GRID = { bpm: 128.9, offset: 0.442, beatsPerBar: 4 };

import { BLOCK_SHOTS, GO, type Shot } from './shots';
import { makeStandIn } from './standin';
import { stringify } from 'yaml';

const ff = async (args: string[]) => {
  const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  if ((await p.exited) !== 0) throw new Error(`ffmpeg: ${err.trim().split('\n').slice(-3).join('\n')}`);
};

/** Render one still and write it as a webp at the size the docs ask for. */
async function shot(opts: {
  name: string; scenes: any[]; taste: any; w: number; h: number;
  outW: number; outH: number; at: number; hud?: boolean; captions?: boolean; noCamera?: boolean;
}) {
  const doc = parseVideo({
    title: opts.name,
    canvas: { width: opts.w, height: opts.h, fps: 30 },
    ...(opts.captions ? { captions: { enabled: true } } : {}),
    scenes: opts.scenes,
  });
  const film = await Film.create({
    doc, taste: opts.taste, grid: GRID, hud: opts.hud ?? false, noCamera: opts.noCamera ?? true,
  });
  const frame = Math.min(film.frameCount - 1, Math.round(film.duration * opts.at * 30));
  const png = join(TMP, `${opts.name}.png`);
  await Bun.write(png, await film.framePng(frame));
  await film.close?.();
  const webp = join(OUT, `${opts.name}.webp`);
  await ff(['-i', png, '-vf', `scale=${opts.outW}:${opts.outH}:flags=lanczos`, '-quality', '82', webp]);
  const kb = (await Bun.file(webp).size) / 1024;
  console.log(`  \x1b[32m✓\x1b[0m ${opts.name}.webp`.padEnd(34) + `\x1b[2m${opts.outW}×${opts.outH} · ${kb.toFixed(0)} KB\x1b[0m`);
  return webp;
}

const only = process.argv[2];
await mkdir(OUT, { recursive: true });
await mkdir(TMP, { recursive: true });
console.log('\n\x1b[1m\x1b[35mstingo\x1b[0m gallery\n');

// ── block gallery: every registered block, one taste, portrait ──────────────
if (!only || only === 'blocks') {
  console.log('\x1b[2m  blocks — 1080×1920 rendered, 520×924 published\x1b[0m');
  const missing = blockNames().filter((n) => !BLOCK_SHOTS[n] && n !== 'camera' && n !== 'image');
  for (const [name, s] of Object.entries(BLOCK_SHOTS)) {
    if (name === 'image' || name === 'camera') continue;   // rendered below, with real inputs
    await shot({ name: `block-${name}`, scenes: [s.scene], taste: THEMES.bootdev,
      w: 1080, h: 1920, outW: 520, outH: 924, at: s.at ?? 0.9 });
  }
  // The image block needs a picture, so it shows one the gallery just made —
  // the PNG intermediate, not the published webp, because satori decodes
  // png/jpeg/gif/svg and silently renders nothing for a webp.
  await shot({ name: 'block-image', scenes: [{ block: 'image', src: join(TMP, 'block-diagram.png'),
    frame: 'window', title: 'diagram.png', caption: 'A still, framed like a window.' }],
    taste: THEMES.bootdev, w: 1080, h: 1920, outW: 520, outH: 924, at: 0.8 });
  // camera without a take renders its placeholder, which is the honest picture
  await shot({ name: 'block-camera', scenes: [BLOCK_SHOTS.camera!.scene],
    taste: THEMES.bootdev, w: 1080, h: 1920, outW: 520, outH: 924, at: 0.5, noCamera: true });
  if (missing.length) console.log(`\x1b[33m  no shot defined for: ${missing.join(', ')}\x1b[0m`);
}

// ── the three camera layouts, decoded from a generated stand-in ────────────
if (!only || only === 'camera') {
  console.log('\n\x1b[2m  camera — three layouts, one stand-in take\x1b[0m');
  // takes/ is gitignored, so there is no footage to shoot these against. A
  // generated stand-in keeps the pictures honest: real decode, real blend,
  // and a frame that says out loud it is not a person.
  const take = await makeStandIn(join(TMP, 'standin.mp4'), { w: 1080, h: 1920, seconds: 12 });
  const shape = { w: 1080, h: 1920, outW: 520, outH: 924, taste: THEMES.bootdev, noCamera: false } as const;

  // `from` differs per shot so the three frames are three moments of one
  // recording — which is how a real script feeds all the layouts. Keep
  // from + the sampled moment inside the take, or it reads past the end.
  await shot({ ...shape, name: 'camera-full', at: 0.5, scenes: [{ block: 'camera',
    camera: { src: take, from: 0, layout: 'full', scrim: 0.28 },
    lower: { name: 'Hersi', role: 'hersietech.com' },
    caption: 'The take fills the frame; the words sit on top of it.' }] });

  // a square inset crops to the middle of a portrait take, which lands on the
  // chest — pulling the crop up is what the offsetY field is for
  await shot({ ...shape, name: 'camera-pip', at: 0.6, scenes: [{ block: 'code',
    lang: 'go', code: GO, highlight: [4, 5], caption: 'go starts it; the channel says when it finished.',
    camera: { src: take, from: 3, layout: 'pip', corner: 'br', shape: 'circle', size: 0.3, zoom: 1.2, offsetY: -0.2 } }] });

  await shot({ ...shape, name: 'camera-split', at: 0.7, scenes: [{ block: 'list',
    title: 'Why Sleep fails', marker: 'arrow',
    items: ['You are guessing how long work takes', 'Too short, and you drop results',
            'Too long, and you waste the speedup', 'It will break on a slower machine'],
    camera: { src: take, from: 5, layout: 'split', side: 'left', ratio: 0.45, offsetY: -0.08 } }] });
}

// ── the same scene under three tastes ──────────────────────────────────────
if (!only || only === 'tastes') {
  console.log('\n\x1b[2m  tastes — the same scene, three profiles\x1b[0m');
  const scene = [{ block: 'code', lang: 'go', code: GO, highlight: [4, 5],
    caption: 'go starts it; the channel says when it finished.' }];
  const { taste: derived } = derive({ id: 'hersie', name: 'Derived', brand: '#ff7a18', mode: 'dark', mood: 'bouncy', texture: 'film' });
  for (const [name, taste] of [['taste-bootdev', THEMES.bootdev], ['taste-dusk', THEMES.dusk], ['taste-hersie', derived]] as const) {
    await shot({ name, scenes: scene, taste, w: 1920, h: 1080, outW: 860, outH: 484, at: 0.95 });
  }
}

// ── hero and captions ──────────────────────────────────────────────────────
if (!only || only === 'hero') {
  console.log('\n\x1b[2m  hero and captions\x1b[0m');
  await shot({ name: 'hero-code', scenes: [BLOCK_SHOTS.code!.scene], taste: THEMES.bootdev,
    w: 1920, h: 1080, outW: 1400, outH: 788, at: 0.95 });
  await shot({ name: 'block-captions', taste: THEMES.bootdev, captions: true,
    scenes: [{ block: 'title', kicker: 'concurrency', text: 'Your program is waiting',
      say: 'Your program is waiting. Most of the time, it is doing nothing at all.' }],
    w: 1080, h: 1920, outW: 520, outH: 924, at: 0.35 });
}

// ── the landing page demo: a real render, with its audio ───────────────────
if (!only || only === 'demo') {
  console.log('\n\x1b[2m  demo video — rendered through the CLI, music and all\x1b[0m');

  // Audio is not decoration here: cuts land on the beat, the bed is ducked and
  // normalised to -14 LUFS. A silent demo hides the feature it is advertising.
  const demoDoc = {
    title: 'stingo demo',
    canvas: { preset: 'horizontal', fps: 30 },
    taste: 'bootdev',
    audio: { music: 'assets/music/loop128.mp3', bpm: 'auto', musicGainDb: -17 },
    scenes: [
      { ...BLOCK_SHOTS.title!.scene, dur: '4bar' },
      { ...BLOCK_SHOTS.statement!.scene, dur: '2bar' },
      { ...BLOCK_SHOTS.code!.scene, dur: '4bar' },
      { ...BLOCK_SHOTS.diagram!.scene, dur: '4bar' },
      { ...BLOCK_SHOTS.chart!.scene, dur: '3bar' },
      { ...BLOCK_SHOTS.stat!.scene, dur: '2bar' },
      { ...BLOCK_SHOTS.outro!.scene, dur: '3bar' },
    ],
  };
  const yamlPath = join(TMP, 'demo.yaml');
  const bigMp4 = join(TMP, 'demo-1080.mp4');
  await Bun.write(yamlPath, stringify(demoDoc));

  const cli = spawn(['bun', 'run', 'packages/stingo/bin/stingo.ts', 'render', yamlPath,
    '--no-hud', '--crf', '23', '-o', bigMp4], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(cli.stdout).text();
  if ((await cli.exited) !== 0) throw new Error(`demo render failed:\n${out}\n${await new Response(cli.stderr).text()}`);

  // 960x540 for the page; the audio is copied, not re-encoded
  await ff(['-i', bigMp4, '-vf', 'scale=960:540:flags=lanczos', '-c:v', 'libx264', '-crf', '26',
    '-preset', 'slow', '-c:a', 'copy', '-movflags', '+faststart', 'docs/assets/video/demo.mp4']);
  await ff(['-ss', '3', '-i', 'docs/assets/video/demo.mp4', '-frames:v', '1',
    '-vf', 'scale=960:540', '-quality', '82', 'docs/assets/img/demo-poster.webp']);

  const streams = spawn(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', 'docs/assets/video/demo.mp4'], { stdout: 'pipe' });
  const kinds = (await new Response(streams.stdout).text()).trim().split('\n').join(' + ');
  await streams.exited;
  const mb = (await Bun.file('docs/assets/video/demo.mp4').size) / 1e6;
  console.log(`  \x1b[32m✓\x1b[0m demo.mp4`.padEnd(34) + `\x1b[2m960×540 · ${mb.toFixed(1)} MB · ${kinds}\x1b[0m`);
  console.log(`  \x1b[32m✓\x1b[0m demo-poster.webp`);
}

console.log('\n\x1b[2m  docs/assets — commit these alongside the change that altered them\x1b[0m\n');
