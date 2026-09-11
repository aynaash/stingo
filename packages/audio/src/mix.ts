import { run as ffrun, duration as probeDuration } from '@stingo/encode';

/** A recorded take contributing its own audio, placed on the timeline. */
export interface ClipCut {
  src: string;
  /** in-point within the take, in seconds */
  from: number;
  /** where the scene sits in the finished video, in seconds */
  at: number;
  /** how much of the take to use */
  dur: number;
  gainDb?: number;
}

export interface MixOpts {
  music?: string;
  vo?: string;
  /** camera takes whose audio belongs in the mix — talking-head scenes */
  clips?: ClipCut[];
  out: string;
  /** target length in seconds; music loops or trims to fit */
  duration: number;
  musicGainDb?: number;
  /** how far music drops under narration */
  duckDb?: number;
  targetLufs?: number;
  fadeIn?: number;
  fadeOut?: number;
}

/** Build the final audio bed: music looped to length, ducked under narration,
 *  normalised to a platform-safe loudness. */
export async function mixAudio(opts: MixOpts): Promise<string | null> {
  const { music, vo, out, duration } = opts;
  if (!music && !vo && !(opts.clips ?? []).length) return null;

  const musicGain = opts.musicGainDb ?? -18;
  const duck = opts.duckDb ?? -12;
  const lufs = opts.targetLufs ?? -14;
  const fadeIn = opts.fadeIn ?? 0.6;
  const fadeOut = opts.fadeOut ?? 1.4;
  const fadeStart = Math.max(0, duration - fadeOut);

  const inputs: string[] = [];
  const filters: string[] = [];
  const clips = (opts.clips ?? []).filter((c) => c.dur > 0.01);

  if (music) {
    inputs.push('-stream_loop', '-1', '-i', music);
    filters.push(
      `[0:a]atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB,volume=${musicGain}dB,` +
      `afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${fadeStart.toFixed(3)}:d=${fadeOut}[music]`,
    );
  }
  let idx = music ? 1 : 0;
  const speech: string[] = [];

  if (vo) {
    inputs.push('-i', vo);
    filters.push(`[${idx++}:a]aresample=48000,apad,atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB[vo0]`);
    speech.push('vo0');
  }

  // each take is trimmed to the slice its scene uses, then delayed to where
  // that scene sits. Sync comes from the timeline, not from hand alignment.
  clips.forEach((c, i) => {
    const label = `cam${i}`;
    const ms = Math.round(Math.max(0, c.at) * 1000);
    inputs.push('-i', c.src);
    filters.push(
      `[${idx++}:a]aresample=48000,atrim=${Math.max(0, c.from).toFixed(3)}:${(Math.max(0, c.from) + c.dur).toFixed(3)},asetpts=N/SR/TB,` +
      `volume=${(c.gainDb ?? 0).toFixed(2)}dB,adelay=${ms}|${ms},apad,atrim=0:${duration.toFixed(3)},asetpts=N/SR/TB[${label}]`,
    );
    speech.push(label);
  });

  let voice: string | null = null;
  if (speech.length === 1) voice = speech[0]!;
  else if (speech.length > 1) {
    filters.push(`${speech.map((l) => `[${l}]`).join('')}amix=inputs=${speech.length}:duration=longest:normalize=0[voice]`);
    voice = 'voice';
  }

  let last: string;
  if (music && voice) {
    // sidechain the music off the narration so speech always sits on top
    filters.push(`[${voice}]asplit=2[vo1][vosc]`);
    filters.push(`[music][vosc]sidechaincompress=threshold=0.03:ratio=${Math.max(2, Math.abs(duck) / 3).toFixed(1)}:attack=20:release=350[ducked]`);
    filters.push(`[ducked][vo1]amix=inputs=2:duration=first:normalize=0[mixed]`);
    last = 'mixed';
  } else {
    last = music ? 'music' : voice!;
  }

  filters.push(`[${last}]loudnorm=I=${lufs}:TP=-1.5:LRA=11,aresample=48000[outa]`);

  await ffrun([...inputs, '-filter_complex', filters.join(';'), '-map', '[outa]',
    '-c:a', 'aac', '-b:a', '192k', '-t', duration.toFixed(3), out], 'mix');
  return out;
}

/** Measured loudness of a finished file, for verifying the mix. */
export async function measureLoudness(file: string): Promise<{ lufs: number; peak: number } | null> {
  const { spawn } = await import('bun');
  const p = spawn(['ffmpeg', '-hide_banner', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'],
    { stdout: 'pipe', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  await p.exited;
  const m = /\{[\s\S]*"input_i"[\s\S]*?\}/.exec(err);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    return { lufs: parseFloat(j.input_i), peak: parseFloat(j.input_tp) };
  } catch { return null; }
}
