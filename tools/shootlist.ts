#!/usr/bin/env bun
/** Turn a video document into the sheet you actually shoot from.
 *
 *  A shot list maintained by hand drifts away from the script within a day, and
 *  then you record the wrong thing. This derives it: every camera scene in
 *  order, what to say, how long, how close to sit, and what is on screen either
 *  side of it so you know what you are cutting into.
 *
 *    bun run tools/shootlist.ts examples/building-stingo/video.yaml
 *    bun run tools/shootlist.ts examples/building-stingo/video.yaml -o SHOOT.md
 */
import { resolve, dirname, basename } from 'node:path';
import { loadDoc, loadTaste } from '@stingo/cli/src/load';
import { plan, probeClips } from '@stingo/film';
import { analyzeBeats } from '@stingo/audio';
import { DEFAULT_GRID, toSeconds, type BeatGrid } from '@stingo/core';

const [, , file, ...rest] = process.argv;
if (!file) {
  console.error('usage: shootlist <video.yaml> [-o SHOOT.md]');
  process.exit(1);
}
const outAt = rest.indexOf('-o');
const outFile = outAt >= 0 ? rest[outAt + 1] : undefined;

const doc = await loadDoc(resolve(file));
const taste = await loadTaste(doc.taste, dirname(resolve(file)));

let grid: BeatGrid = DEFAULT_GRID;
if (doc.audio.music) {
  try {
    const b = await analyzeBeats(doc.audio.music, {
      bpm: typeof doc.audio.bpm === 'number' ? doc.audio.bpm : undefined,
    });
    grid = { bpm: b.bpm, offset: b.offset, beatsPerBar: b.beatsPerBar };
  } catch { /* the cut is still worth printing without music */ }
}
const { clips } = await probeClips(doc);
const { timeline } = plan(doc, taste, grid, clips);

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** How close to sit, stated as a consequence rather than a number. */
function framing(cam: any, canvas: { width: number; height: number }): string {
  if (cam.layout === 'full') {
    return `fills the frame (${canvas.width}×${canvas.height}) — anything smaller is upscaled`;
  }
  if (cam.layout === 'split') {
    const px = Math.round(canvas.width * cam.ratio);
    return `about ${px}px wide, on the ${cam.side} — frame yourself off-centre toward that side`;
  }
  const px = Math.round(canvas.width * cam.size);
  const shape = cam.shape === 'circle' ? ', circular crop' : '';
  const corners: Record<string, string> = {
    tl: 'top left', tr: 'top right', bl: 'bottom left', br: 'bottom right',
  };
  return `a ${px}px inset in the ${corners[String(cam.corner)] ?? cam.corner}${shape}`
    + ' — sit closer than feels natural';
}

/** What a non-camera scene puts on screen, in one line. */
function gist(scene: any): string {
  switch (scene.block) {
    case 'title': return `title — "${scene.text}"`;
    case 'statement': return `statement — "${scene.text}"`;
    case 'code': return `code (${scene.lang ?? 'ts'})${scene.caption ? ` — ${scene.caption}` : ''}`;
    case 'terminal': return `terminal — ${scene.lines?.[0]?.cmd ?? scene.title ?? 'output'}`;
    case 'list': return `list — ${scene.title ?? `${scene.items?.length ?? 0} items`}`;
    case 'chart': return `chart — ${scene.title ?? 'data'}`;
    case 'diagram': return `diagram — ${scene.title ?? 'boxes and arrows'}`;
    case 'compare': return `compare — ${scene.left?.title} vs ${scene.right?.title}`;
    case 'stat': return `stat — ${scene.value} ${scene.label}`;
    case 'quote': return `quote — ${scene.attrib ?? 'quotation'}`;
    case 'image': return `image — ${basename(String(scene.src ?? ''))}`;
    case 'broll': return `breathing room${scene.caption ? ` — ${scene.caption}` : ''}`;
    case 'outro': return `outro — ${scene.text}`;
    default: return scene.block;
  }
}

// group scenes by take, because you shoot a take once, not a scene at a time
const takes = new Map<string, { scenes: number[]; reads: { from: number; dur: number; idx: number }[] }>();
doc.scenes.forEach((s: any, i) => {
  if (!s.camera) return;
  const cue = timeline.cues[i]!;
  const src = basename(s.camera.src);
  const e = takes.get(src) ?? { scenes: [], reads: [] };
  e.scenes.push(i);
  e.reads.push({ from: toSeconds(s.camera.from, grid), dur: cue.dur, idx: i });
  takes.set(src, e);
});

const L: string[] = [];
L.push(`# Shot list — ${doc.title}`);
L.push('');
L.push(`Generated from \`${basename(file)}\`. Do not edit by hand — re-run:`);
L.push('');
L.push('```bash');
L.push(`bun run tools/shootlist.ts ${file} -o ${outFile ?? 'SHOOT.md'}`);
L.push('```');
L.push('');
L.push(`**${takes.size} takes** · cut runs ${mmss(timeline.duration)} · `
  + `${doc.canvas.width}×${doc.canvas.height} @ ${doc.canvas.fps}fps`
  + (doc.audio.music ? ` · ${grid.bpm.toFixed(1)} BPM` : ''));
L.push('');
L.push('Each take is **one continuous recording**. Where a take is read from more');
L.push('than once, the later scene picks up further into the same file — do not');
L.push('cut between them.');
L.push('');

let n = 0;
for (const [src, e] of takes) {
  n++;
  const first = doc.scenes[e.scenes[0]!] as any;
  const needed = Math.max(...e.reads.map((r) => r.from + r.dur));
  L.push('---');
  L.push('');
  L.push(`## ${n}. \`${src}\``);
  L.push('');
  L.push(`**Record at least ${Math.ceil(needed)}s.** Used by ${e.scenes.length} `
    + `scene${e.scenes.length > 1 ? 's' : ''}.`);
  L.push('');

  for (const r of e.reads) {
    const s = doc.scenes[r.idx] as any;
    const cue = timeline.cues[r.idx]!;
    const before = r.idx > 0 ? gist(doc.scenes[r.idx - 1]) : null;
    const after = r.idx < doc.scenes.length - 1 ? gist(doc.scenes[r.idx + 1]) : null;

    L.push(`### ${mmss(cue.start)} → ${mmss(cue.end)} · reads from ${r.from.toFixed(0)}s · ${s.camera.layout}`);
    L.push('');
    L.push(`- **Framing:** ${framing(s.camera, doc.canvas)}`);
    if (s.block !== 'camera') L.push(`- **Over:** ${gist(s)}`);
    if (s.lower) L.push(`- **Name card:** ${s.lower.name}${s.lower.role ? ` — ${s.lower.role}` : ''}`);
    if (before) L.push(`- **Cutting from:** ${before}`);
    if (after) L.push(`- **Cutting to:** ${after}`);
    L.push('');
    if (s.say) {
      L.push('> ' + String(s.say).trim().replace(/\s+/g, ' '));
      L.push('');
      const words = String(s.say).trim().split(/\s+/).length;
      L.push(`*${words} words in ${cue.dur.toFixed(1)}s — about `
        + `${Math.round((words / cue.dur) * 60)} wpm. Say it your way; if you run `
        + `long, delete this scene's \`dur:\`.*`);
      L.push('');
    }
  }
}

L.push('---');
L.push('');
L.push('## When the takes exist');
L.push('');
L.push('```bash');
L.push(`stingo takes  ${file}      # resolution, fps, length, audio`);
L.push(`stingo render ${file} --draft`);
L.push(`stingo render ${file}`);
L.push('```');
L.push('');
L.push('Delete a scene\'s `dur:` once its take is shot and the scene runs as long');
L.push('as you actually spoke.');

const md = L.join('\n') + '\n';
if (outFile) {
  await Bun.write(resolve(dirname(resolve(file)), outFile), md);
  console.log(`\x1b[32m✓\x1b[0m ${outFile} — ${takes.size} takes, ${mmss(timeline.duration)}`);
} else {
  console.log(md);
}
