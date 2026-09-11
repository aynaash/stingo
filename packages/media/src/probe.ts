import { spawn } from 'bun';

export interface VideoMeta {
  file: string;
  width: number;
  height: number;
  /** container frame rate, as a float */
  fps: number;
  duration: number;
  hasAudio: boolean;
  /** display rotation from the container, in degrees — phone footage is often 90 */
  rotation: number;
}

const jsonOut = async (args: string[]): Promise<any> => {
  const p = spawn(['ffprobe', '-v', 'error', '-print_format', 'json', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const out = await new Response(p.stdout).text();
  const err = await new Response(p.stderr).text();
  const code = await p.exited;
  if (code !== 0) throw new Error(`ffprobe failed (exit ${code}):\n${err.trim().split('\n').slice(-6).join('\n')}`);
  try { return JSON.parse(out); } catch { throw new Error(`ffprobe returned unparseable output for ${args.at(-1)}`); }
};

/** Parse ffprobe's "30000/1001" style rate strings. */
const ratio = (s: unknown): number => {
  if (typeof s !== 'string') return 0;
  const [a, b] = s.split('/');
  const n = Number(a), d = b === undefined ? 1 : Number(b);
  return d ? n / d : 0;
};

/** Inspect a video file. Everything the camera pass needs to place and time it. */
export async function probeVideo(file: string): Promise<VideoMeta> {
  if (!(await Bun.file(file).exists())) throw new Error(`camera source not found: ${file}`);
  const data = await jsonOut(['-show_streams', '-show_format', file]);
  const streams: any[] = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v) throw new Error(`no video stream in ${file}`);

  // rotation lives in a side-data packet on modern ffmpeg, in a tag on older files
  const side = (v.side_data_list ?? []).find((d: any) => d.rotation !== undefined);
  const rotation = ((Math.round(Number(side?.rotation ?? v.tags?.rotate ?? 0)) % 360) + 360) % 360;

  const duration = Number(data.format?.duration ?? v.duration ?? 0);
  return {
    file,
    width: Number(v.width) || 0,
    height: Number(v.height) || 0,
    fps: ratio(v.avg_frame_rate) || ratio(v.r_frame_rate) || 30,
    duration: Number.isFinite(duration) ? duration : 0,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
    rotation,
  };
}
