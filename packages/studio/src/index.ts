import { watch } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { Film, plan, probeClips } from '@stingo/film';
import { loadDoc, loadTaste } from '@stingo/cli/src/load';
import { analyzeBeats } from '@stingo/audio';
import { DEFAULT_GRID, type BeatGrid } from '@stingo/core';
import { page } from './page';

export interface ServeOpts { file: string; port: number; taste?: string; flags?: Record<string, any> }

/** Preview renders at reduced resolution — scrubbing needs to feel immediate,
 *  and layout is defined in stage units so a half-size frame is a faithful
 *  preview of the full-size render, not an approximation. */
const PREVIEW_MAX = 620;

export async function serve(opts: ServeOpts) {
  const path = resolve(opts.file);
  let film: Film | null = null;
  let meta: any = {};
  let version = 0;
  let building: Promise<void> | null = null;

  async function build() {
    const doc = await loadDoc(path);
    const taste = await loadTaste(opts.taste || doc.taste, dirname(path));
    let grid: BeatGrid = DEFAULT_GRID;
    if (doc.audio.music) {
      try {
        const a = await analyzeBeats(doc.audio.music, { bpm: typeof doc.audio.bpm === 'number' ? doc.audio.bpm : undefined });
        grid = { bpm: a.bpm, offset: a.offset, beatsPerBar: a.beatsPerBar };
      } catch { /* music optional in preview */ }
    }
    const full = { w: doc.canvas.width, h: doc.canvas.height };
    const scale = Math.min(1, PREVIEW_MAX / Math.max(full.w, full.h));
    const scaled = structuredClone(doc);
    scaled.canvas.width = Math.round(full.w * scale / 2) * 2;
    scaled.canvas.height = Math.round(full.h * scale / 2) * 2;

    const { clips, missing } = await probeClips(scaled);
    // a rebuild replaces the Film, so the outgoing one's decoder processes have
    // to be released or every save leaks an ffmpeg per take
    const previous = film;
    film = await Film.create({ doc: scaled, taste, grid, hud: true, clips });
    if (previous) await previous.close().catch(() => {});
    const { timeline, warnings } = plan(scaled, taste, grid, clips);
    for (const m of missing) warnings.push(`camera source not readable, showing a placeholder — ${m}`);
    meta = {
      title: doc.title, full, preview: { w: scaled.canvas.width, h: scaled.canvas.height },
      fps: doc.canvas.fps, frames: timeline.frameCount, duration: timeline.duration,
      bpm: grid.bpm, offset: grid.offset, beatsPerBar: grid.beatsPerBar,
      taste: { id: taste.id, name: taste.name, palette: taste.palette },
      cutOn: taste.pacing.cutOn, warnings,
      cues: timeline.cues.map((c) => ({ ...c })),
      version: ++version,
    };
  }

  building = build();
  await building;

  watch(path, { persistent: false }, () => {
    building = build().catch((e) => { meta.error = e.message; console.error(`\x1b[31m✗ ${e.message}\x1b[0m`); });
  });

  const server = Bun.serve({
    port: opts.port,
    async fetch(req) {
      const url = new URL(req.url);
      if (building) await building.catch(() => {});

      if (url.pathname === '/') return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (url.pathname === '/meta') return Response.json(meta);
      if (url.pathname === '/frame') {
        const n = Math.max(0, Math.min((film?.frameCount ?? 1) - 1, Number(url.searchParams.get('n') ?? 0)));
        if (!film) return new Response('not ready', { status: 503 });
        try {
          const png = new Uint8Array(await film.framePng(n));
          return new Response(png, { headers: { 'content-type': 'image/png', 'cache-control': 'no-store' } });
        } catch (e: any) {
          return new Response(e.message, { status: 500 });
        }
      }
      return new Response('not found', { status: 404 });
    },
  });

  const p = meta.taste.palette;
  console.log(`\n\x1b[1m\x1b[35mstingo studio\x1b[0m  ${meta.title}`);
  console.log(`\x1b[2m  ${meta.full.w}x${meta.full.h} · previewing at ${meta.preview.w}x${meta.preview.h} · ${meta.frames} frames · ${meta.bpm} BPM\x1b[0m`);
  console.log(`\n  \x1b[36mhttp://localhost:${server.port}\x1b[0m\n`);
  console.log(`\x1b[2m  watching ${basename(path)} — save to reload\x1b[0m`);
}
