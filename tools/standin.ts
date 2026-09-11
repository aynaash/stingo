/** A stand-in for a recorded take.
 *
 *  `takes/` is gitignored on purpose — video blobs do not belong in the repo —
 *  which left the one feature you cannot understand from prose with nothing to
 *  look at. This generates a placeholder that shows where a subject lands in
 *  each layout without pretending to be a photograph of anyone. It is labelled
 *  as a stand-in in the frame itself, so a reader is never misled about what
 *  they are seeing. */
import { Resvg } from '@resvg/resvg-js';
import { spawn } from 'bun';
import { resolve } from 'node:path';

export async function makeStandIn(out: string, opts: { w?: number; h?: number; seconds?: number } = {}) {
  const W = opts.w ?? 1080, H = opts.h ?? 1920, secs = opts.seconds ?? 12;
  const headY = H * 0.32, bodyY = H * 0.52;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <radialGradient id="room" cx="50%" cy="34%" r="72%">
        <stop offset="0" stop-color="#4a382e"/><stop offset="0.55" stop-color="#261d19"/><stop offset="1" stop-color="#120e0d"/>
      </radialGradient>
      <linearGradient id="subj" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#8a6e5a"/><stop offset="1" stop-color="#33271f"/>
      </linearGradient>
      <radialGradient id="key" cx="34%" cy="24%" r="42%">
        <stop offset="0" stop-color="#ffd9a8" stop-opacity=".26"/><stop offset="1" stop-color="#ffd9a8" stop-opacity="0"/>
      </radialGradient>
      <filter id="soft"><feGaussianBlur stdDeviation="22"/></filter>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#room)"/>
    <rect width="${W}" height="${H}" fill="url(#key)"/>
    <g filter="url(#soft)">
      <ellipse cx="${W / 2}" cy="${bodyY}" rx="${W * 0.4}" ry="${H * 0.17}" fill="url(#subj)"/>
      <circle cx="${W / 2}" cy="${headY}" r="${W * 0.2}" fill="url(#subj)"/>
    </g>
    <!-- the label sits just under the shoulders, not at the bottom: a lower
         third lands there, and two labels on top of each other read as a bug -->
    <text x="${W / 2}" y="${H * 0.74}" font-family="JetBrains Mono" font-size="${W * 0.032}"
          fill="#a4897a" text-anchor="middle">stand-in take</text>
    <text x="${W / 2}" y="${H * 0.775}" font-family="JetBrains Mono" font-size="${W * 0.022}"
          fill="#6b5a4c" text-anchor="middle">record your own — see RECORDING.md</text>
  </svg>`;

  const fonts = [resolve('assets/fonts/JetBrainsMonoNerdFont-Regular.ttf')];
  const png = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: fonts, defaultFontFamily: 'JetBrains Mono' } }).render().asPng();
  const still = out.replace(/\.mp4$/, '.png');
  await Bun.write(still, png);

  // a slow push-in and drift, so it reads as footage rather than a freeze;
  // a silent track is still a track, which exercises the audio path
  const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-loop', '1', '-i', still,
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono',
    '-t', String(secs), '-r', '30',
    '-filter_complex', `[0:v]zoompan=z='min(zoom+0.0005,1.09)':d=${secs * 30}:x='iw/2-(iw/zoom/2)+sin(on/55)*10':y='ih/2-(ih/zoom/2)+cos(on/70)*6':s=${W}x${H},format=yuv420p[v]`,
    '-map', '[v]', '-map', '1:a', '-shortest',
    '-c:v', 'libx264', '-crf', '24', '-preset', 'medium', '-c:a', 'aac', '-b:a', '96k', out],
    { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  if ((await p.exited) !== 0) throw new Error(`stand-in render failed: ${err.trim().split('\n').slice(-3).join('\n')}`);
  return out;
}
