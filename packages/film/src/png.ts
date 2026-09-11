import { spawn } from 'bun';

/** Encode an RGBA buffer to PNG via ffmpeg. Used for stills and preview frames;
 *  the video path never round-trips through PNG. */
export async function rgbaToPng(px: Buffer, w: number, h: number): Promise<Buffer> {
  const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', 'pipe:0',
    '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'],
    { stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' });
  p.stdin.write(px);
  await p.stdin.end();
  const out = Buffer.from(await new Response(p.stdout).arrayBuffer());
  const code = await p.exited;
  if (code !== 0) throw new Error(`png encode failed: ${await new Response(p.stderr).text()}`);
  return out;
}
