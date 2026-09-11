import { spawn } from 'bun';

export interface Pcm { data: Float32Array; sampleRate: number; duration: number }

/** Decode any audio file to mono float32 at a working rate.
 *  22050Hz is plenty for onset detection and a quarter the work of 44.1k. */
export async function decodePcm(file: string, sampleRate = 22050): Promise<Pcm> {
  const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-i', file,
    '-f', 'f32le', '-ac', '1', '-ar', String(sampleRate), 'pipe:1'],
    { stdout: 'pipe', stderr: 'pipe' });
  const buf = Buffer.from(await new Response(p.stdout).arrayBuffer());
  const err = await new Response(p.stderr).text();
  const code = await p.exited;
  if (code !== 0) throw new Error(`decode failed for ${file}:\n${err.split('\n').slice(-8).join('\n')}`);
  const data = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
  return { data, sampleRate, duration: data.length / sampleRate };
}
