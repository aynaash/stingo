import { mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'bun';
import { Film } from './film';
import { plan, type ClipTable } from './plan';
import { Encoder, run as ffrun } from '@stingo/encode';
import type { VideoDoc, TasteProfile } from '@stingo/schema';
import type { BeatGrid } from '@stingo/core';
import { DEFAULT_GRID } from '@stingo/core';

export interface RenderOpts {
  doc: VideoDoc;
  taste: TasteProfile;
  out: string;
  grid?: BeatGrid;
  fontDir?: string;
  hud?: boolean;
  workers?: number;
  crf?: number;
  preset?: string;
  audio?: string;
  workDir?: string;
  /** measured take lengths, from probeClips */
  clips?: ClipTable;
  /** render camera placeholders instead of decoding footage */
  noCamera?: boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface RenderResult { file: string; frames: number; duration: number; seconds: number; workers: number }

/** Render the whole film. Splits frames across processes, each producing its own
 *  MP4 segment, then concatenates with stream copy (no re-encode). */
/** Find the worker script for whichever layout we are running in.
 *
 *  From source it sits beside this file as worker.ts; from the published
 *  bundle it is dist/worker.js beside dist/cli.js. Assuming either one breaks
 *  the other, and the bundled case breaks silently at spawn time. */
function resolveWorker(): string {
  const here = new URL('./', import.meta.url);
  for (const name of ['worker.ts', 'worker.js']) {
    const p = new URL(name, here).pathname;
    if (existsSync(p)) return p;
  }
  throw new Error(
    `could not find the render worker beside ${here.pathname} — ` +
    'if this is an installed copy, the package was built without its worker entry point',
  );
}

export async function renderVideo(opts: RenderOpts): Promise<RenderResult> {
  const t0 = Date.now();
  const grid = opts.grid ?? DEFAULT_GRID;
  const { timeline } = plan(opts.doc, opts.taste, grid, opts.clips);
  const total = timeline.frameCount;
  if (total === 0) throw new Error('nothing to render: timeline is empty');

  // One worker per hardware thread, even when each also runs a video decoder:
  // measured at 45s / 49s / 65s for 8 / 4 / 2 workers on an 8-thread laptop
  // rendering a document with camera takes. ffmpeg blocks on IO often enough
  // that oversubscription still wins.
  const want = opts.workers ?? navigator.hardwareConcurrency ?? 4;
  const workers = Math.max(1, Math.min(want, Math.ceil(total / 30)));
  const work = opts.workDir ?? join('.stingo', `render-${Date.now()}`);
  await mkdir(work, { recursive: true });

  const per = Math.ceil(total / workers);
  const jobs = Array.from({ length: workers }, (_, i) => ({
    id: i,
    start: i * per,
    end: Math.min(total, (i + 1) * per),
    out: resolve(join(work, `seg-${String(i).padStart(3, '0')}.mp4`)),
  })).filter((j) => j.end > j.start);

  const workerScript = resolveWorker();
  const progress = new Array(jobs.length).fill(0);
  let lastReport = 0;

  await Promise.all(jobs.map(async (j) => {
    const jobFile = resolve(join(work, `job-${j.id}.json`));
    await writeFile(jobFile, JSON.stringify({
      ...j, doc: opts.doc, taste: opts.taste, grid, fontDir: opts.fontDir ? resolve(opts.fontDir) : undefined,
      hud: opts.hud, crf: opts.crf, preset: opts.preset,
      clips: opts.clips ? [...opts.clips] : undefined, noCamera: opts.noCamera,
    }));
    const p = spawn(['bun', 'run', workerScript, jobFile], { stdout: 'pipe', stderr: 'pipe' });

    const reader = p.stdout.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const ln of lines) {
        const m = /^[PD] (\d+) (\d+)$/.exec(ln.trim());
        if (m) {
          progress[Number(m[1])] = Number(m[2]);
          const sum = progress.reduce((a, b) => a + b, 0);
          if (opts.onProgress && (sum - lastReport >= 10 || sum === total)) { lastReport = sum; opts.onProgress(sum, total); }
        }
      }
    }
    const err = await new Response(p.stderr).text();
    const code = await p.exited;
    if (code !== 0) throw new Error(`worker ${j.id} failed (exit ${code}):\n${err.split('\n').slice(-20).join('\n')}`);
  }));

  // concat segments without re-encoding
  const listFile = join(work, 'segments.txt');
  await writeFile(listFile, jobs.map((j) => `file '${j.out}'`).join('\n'));
  const silent = join(work, 'video.mp4');
  await ffrun(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', silent], 'concat');

  if (opts.audio) {
    await ffrun(['-i', silent, '-i', opts.audio, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', opts.out], 'mux');
  } else {
    await ffrun(['-i', silent, '-c', 'copy', '-movflags', '+faststart', opts.out], 'finalise');
  }

  if (!opts.workDir) await rm(work, { recursive: true, force: true });

  return { file: opts.out, frames: total, duration: timeline.duration, seconds: (Date.now() - t0) / 1000, workers: jobs.length };
}
