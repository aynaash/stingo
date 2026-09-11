/** Render one contiguous frame range to its own MP4 segment.
 *  Segments are concatenated with stream copy afterwards, so no pixel data
 *  ever crosses a process boundary. */
import { Film } from './film';
import { Encoder } from '@stingo/encode';
import { parseVideo, TasteProfile } from '@stingo/schema';

const [, , jobPath] = process.argv;
if (!jobPath) throw new Error('worker: missing job file');

const job = await Bun.file(jobPath).json();
const doc = parseVideo(job.doc);
const taste = TasteProfile.parse(job.taste);

const clips = new Map<string, number>(job.clips ?? []);
const film = await Film.create({ doc, taste, grid: job.grid, fontDir: job.fontDir, hud: job.hud, noCamera: job.noCamera, clips });
const enc = new Encoder({
  width: doc.canvas.width, height: doc.canvas.height, fps: doc.canvas.fps,
  out: job.out, crf: job.crf, preset: job.preset, gop: doc.canvas.fps * 2,
});

let done = 0;
for (let f = job.start; f < job.end; f++) {
  await enc.write(await film.framePixels(f));
  done++;
  if (done % 10 === 0 || f === job.end - 1) console.log(`P ${job.id} ${done}`);
}
await enc.finish();
await film.close();
console.log(`D ${job.id} ${done}`);
