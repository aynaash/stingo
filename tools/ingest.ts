#!/usr/bin/env bun
/** Turn a phone's camera roll into the takes a script expects.
 *
 *  A phone hands you IMG_4312.MOV: HEVC, rotation in a metadata tag rather
 *  than in the pixels, 4K when the frame is 1080p, audio at whatever rate it
 *  felt like. The script wants takes/03-wish.mp4. Doing that by hand for
 *  fourteen takes is where an afternoon goes.
 *
 *  Files map to takes in recording order, which is the order the shot list is
 *  written in — shoot top to bottom and the mapping is right. Nothing is
 *  written without --apply.
 *
 *    bun run tools/ingest.ts <video.yaml> <folder>            show the plan
 *    bun run tools/ingest.ts <video.yaml> <folder> --apply    write the takes
 */
import { readdir, mkdir, stat } from 'node:fs/promises';
import { join, resolve, dirname, extname, basename, relative } from 'node:path';
import { spawn } from 'bun';
import { loadDoc, loadTaste } from '@stingo/cli/src/load';
import { plan, probeClips } from '@stingo/film';
import { toSeconds, DEFAULT_GRID } from '@stingo/core';

const C = { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', p: '\x1b[35m', x: '\x1b[0m' };
const log = (s = '') => console.log(s);

const [, , docPath, folder, ...rest] = process.argv;
const apply = rest.includes('--apply');
if (!docPath || !folder) {
  console.error('usage: ingest <video.yaml> <folder-of-clips> [--apply]');
  process.exit(1);
}

const ffprobe = async (file: string) => {
  const p = spawn(['ffprobe', '-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file],
    { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  if ((await p.exited) !== 0) return null;
  try { return JSON.parse(out); } catch { return null; }
};

/** Rotation lives in a side-data packet on modern files and a tag on older
 *  ones. Left in metadata it survives into the render as a sideways take. */
function rotationOf(v: any): number {
  const side = (v.side_data_list ?? []).find((s: any) => s.rotation != null);
  const raw = side?.rotation ?? v.tags?.rotate ?? 0;
  return ((Number(raw) % 360) + 360) % 360;
}

const doc = await loadDoc(docPath);
const taste = await loadTaste(doc.taste, dirname(resolve(docPath)));
const base = dirname(resolve(docPath));
const { clips } = await probeClips(doc).catch(() => ({ clips: new Map<string, number>() }));
const { timeline } = plan(doc, taste, DEFAULT_GRID, clips);

/** Every take the script asks for, in the order it is first used, with the
 *  longest span any scene reads from it. */
const need = new Map<string, { seconds: number; scenes: number }>();
doc.scenes.forEach((s: any, i: number) => {
  if (s.block !== 'camera' && !s.camera) return;
  const cam = s.camera;
  if (!cam?.src) return;
  const cue = timeline.cues[i];
  const end = toSeconds(cam.from, DEFAULT_GRID, 0) + (cue?.dur ?? 0);
  const cur = need.get(cam.src);
  need.set(cam.src, { seconds: Math.max(cur?.seconds ?? 0, end), scenes: (cur?.scenes ?? 0) + 1 });
});

if (need.size === 0) {
  log(`${C.y}no camera scenes in ${basename(docPath)} — nothing to ingest${C.x}`);
  process.exit(0);
}

const VIDEO = new Set(['.mov', '.mp4', '.m4v', '.avi', '.mkv']);
const entries = await readdir(folder);
const found: { file: string; mtime: number }[] = [];
for (const e of entries) {
  if (!VIDEO.has(extname(e).toLowerCase())) continue;
  const full = join(folder, e);
  found.push({ file: full, mtime: (await stat(full)).mtimeMs });
}
found.sort((a, b) => a.mtime - b.mtime);   // recording order

const wanted = [...need.entries()];
log(`\n${C.b}${C.p}stingo${C.x} ingest  ${C.dim}${basename(docPath)}${C.x}\n`);
log(`${C.dim}  ${wanted.length} takes wanted · ${found.length} clips found · mapped in recording order${C.x}\n`);

const { width, height } = doc.canvas;
let problems = 0;

for (let i = 0; i < wanted.length; i++) {
  const [src, req] = wanted[i]!;
  const out = resolve(base, src);
  const clip = found[i];
  // loadDoc resolves take paths; show them the way the script writes them
  const shown = src.startsWith('/') ? relative(base, src) : src;
  const label = `${String(i + 1).padStart(2, '0')}  ${shown}`;

  if (!clip) {
    log(`  ${C.y}—${C.x}  ${label.padEnd(26)} ${C.y}no clip — record it, or the render will fail here${C.x}`);
    problems++;
    continue;
  }

  const meta = await ffprobe(clip.file);
  const v = meta?.streams?.find((s: any) => s.codec_type === 'video');
  const a = meta?.streams?.find((s: any) => s.codec_type === 'audio');
  const dur = Number(meta?.format?.duration ?? 0);
  const rot = v ? rotationOf(v) : 0;
  const swap = rot === 90 || rot === 270;
  const vw = swap ? Number(v?.height ?? 0) : Number(v?.width ?? 0);
  const vh = swap ? Number(v?.width ?? 0) : Number(v?.height ?? 0);

  const notes: string[] = [];
  if (dur + 0.05 < req.seconds) { notes.push(`${C.r}short: ${dur.toFixed(1)}s, needs ${req.seconds.toFixed(1)}s${C.x}`); problems++; }
  if (!a) { notes.push(`${C.r}no audio track${C.x}`); problems++; }
  if (vw < width || vh < height) notes.push(`${C.y}${vw}x${vh} under ${width}x${height}, will upscale${C.x}`);
  if (rot) notes.push(`${C.dim}rotation ${rot}° baked in${C.x}`);

  log(`  ${C.g}→${C.x}  ${label.padEnd(26)} ${C.dim}${basename(clip.file)} · ${vw}x${vh} · ${dur.toFixed(1)}s · ${v?.codec_name ?? '?'} · needs ${req.seconds.toFixed(0)}s${C.x}`);
  if (notes.length) log(`      ${notes.join('  ')}`);

  if (apply) {
    await mkdir(dirname(out), { recursive: true });
    // Bake the rotation, land on the frame size the script renders at, and
    // re-encode to H.264 + AAC. HEVC decodes several times slower per frame,
    // and a render touches every frame of every take.
    const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', clip.file,
      '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},format=yuv420p`,
      '-c:v', 'libx264', '-crf', '19', '-preset', 'slow',
      '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1',
      '-movflags', '+faststart', out], { stdout: 'pipe', stderr: 'pipe' });
    const err = await new Response(p.stderr).text();
    if ((await p.exited) !== 0) {
      log(`      ${C.r}transcode failed: ${err.trim().split('\n').slice(-2).join(' ')}${C.x}`);
      problems++;
    } else {
      const mb = (await Bun.file(out).size) / 1e6;
      log(`      ${C.g}✓${C.x} ${C.dim}${mb.toFixed(1)} MB${C.x}`);
    }
  }
}

if (found.length > wanted.length) {
  log(`\n${C.y}  ${found.length - wanted.length} extra clip(s) ignored${C.x} ${C.dim}— delete the bad attempts so the order lines up${C.x}`);
}

log();
if (!apply) {
  log(`${C.dim}  nothing written. re-run with --apply once the mapping above is right.${C.x}\n`);
} else if (problems) {
  log(`${C.y}  ${problems} problem(s) above — check before rendering.${C.x}\n`);
} else {
  log(`${C.g}  all takes in place.${C.x} ${C.dim}next: bun stingo still ${docPath} --at 5 -o check.png${C.x}\n`);
}
