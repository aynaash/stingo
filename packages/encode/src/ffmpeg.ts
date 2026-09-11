import { spawn } from 'bun';

export async function ffmpegVersion(): Promise<string> {
  const p = spawn(['ffmpeg', '-version'], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.split('\n')[0] ?? 'unknown';
}

export async function hasEncoder(name: string): Promise<boolean> {
  const p = spawn(['ffmpeg', '-hide_banner', '-encoders'], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return new RegExp(`\\b${name}\\b`).test(out);
}

/** Run ffmpeg to completion, throwing with stderr tail on failure. */
export async function run(args: string[], label = 'ffmpeg'): Promise<void> {
  const p = spawn(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  const code = await p.exited;
  if (code !== 0) throw new Error(`${label} failed (exit ${code}):\n${err.split('\n').slice(-12).join('\n')}`);
}

/** Probe duration in seconds. */
export async function duration(file: string): Promise<number> {
  const p = spawn(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  await p.exited;
  const d = parseFloat(out.trim());
  return Number.isFinite(d) ? d : 0;
}
