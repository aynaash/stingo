import { spawn } from 'bun';
import { measureLoudness } from './mix';
import type { MixOpts } from './mix';

/** Measuring the finished mix.
 *
 *  Bad audio is what loses viewers, and it is the one fault a still cannot show
 *  you: a frame can be checked by looking at it, a mix can only be checked by
 *  listening to the whole thing — which nobody does on the tenth render. So the
 *  two numbers that matter get printed instead.
 *
 *  Integrated loudness says whether the platform will turn you down or up.
 *  The gap between speech and music says whether the words are audible over the
 *  bed, which is the mistake people actually make: a track that sounded good on
 *  laptop speakers and buries the narration on a phone. */

/** Speech should sit this far above the music bed. Below the floor the bed
 *  competes with the words; above the ceiling the music may as well not be
 *  there. Both edges come from broadcast dialogue practice rather than taste. */
export const SPEECH_LEAD = { floor: 8, ceiling: 22 } as const;

export interface MixReport {
  /** integrated loudness and true peak of the finished file */
  lufs: number;
  peak: number;
  /** target the mix was normalised to */
  targetLufs: number;
  /** integrated loudness of each stem as it enters the mix, when present */
  speechLufs?: number;
  musicLufs?: number;
  /** speechLufs - musicLufs, in LU; the number to act on */
  lead?: number;
  notes: string[];
}

/** Integrated loudness of one input, with a gain applied, measured the way the
 *  mix will hear it. Returns null when the file has no decodable audio. */
async function stemLoudness(file: string, gainDb = 0): Promise<number | null> {
  const filter = gainDb ? `volume=${gainDb}dB,ebur128=peak=true` : 'ebur128=peak=true';
  const p = spawn(['ffmpeg', '-hide_banner', '-nostats', '-i', file, '-af', filter, '-f', 'null', '-'],
    { stdout: 'ignore', stderr: 'pipe' });
  const err = await new Response(p.stderr).text();
  await p.exited;
  // ebur128 prints a Summary block; the integrated figure is the last "I:" line
  const m = [...err.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  if (!m.length) return null;
  const v = Number(m[m.length - 1]![1]);
  return Number.isFinite(v) ? v : null;
}

/** Loudest of several speech sources, treated as one voice. Camera takes and a
 *  voiceover never overlap in a well-cut film, so the loudest is what a viewer
 *  hears rather than their sum. */
async function speechLoudness(opts: Pick<MixOpts, 'vo' | 'clips'>): Promise<number | null> {
  const sources: { src: string; gainDb: number }[] = [];
  if (opts.vo) sources.push({ src: opts.vo, gainDb: 0 });
  for (const c of opts.clips ?? []) if (c.dur > 0.01) sources.push({ src: c.src, gainDb: c.gainDb ?? 0 });
  if (!sources.length) return null;

  const seen = new Map<string, number>();
  for (const s of sources) {
    const key = `${s.src}|${s.gainDb}`;
    if (seen.has(key)) continue;
    const l = await stemLoudness(s.src, s.gainDb);
    if (l != null) seen.set(key, l);
  }
  const vals = [...seen.values()];
  return vals.length ? Math.max(...vals) : null;
}

export interface VerifyOpts {
  /** the finished file — the mixed audio, or the encoded video */
  file: string;
  targetLufs: number;
  music?: string;
  musicGainDb?: number;
  vo?: string;
  clips?: MixOpts['clips'];
}

/** Measure a finished mix and say what is wrong with it, if anything. */
export async function verifyMix(opts: VerifyOpts): Promise<MixReport | null> {
  const final = await measureLoudness(opts.file);
  if (!final) return null;

  const notes: string[] = [];
  const report: MixReport = {
    lufs: final.lufs, peak: final.peak, targetLufs: opts.targetLufs, notes,
  };

  // loudnorm aims at the target but cannot always reach it — a mix with a long
  // silent tail, or one already quieter than the target with no headroom to
  // spend, lands short. Worth saying, because the platform will make up the
  // difference and it will not do it as carefully.
  if (Math.abs(final.lufs - opts.targetLufs) > 1.5) {
    notes.push(
      `integrated loudness is ${final.lufs.toFixed(1)} LUFS against a ${opts.targetLufs} target — `
      + `${final.lufs < opts.targetLufs ? 'quieter' : 'louder'} than intended by `
      + `${Math.abs(final.lufs - opts.targetLufs).toFixed(1)} LU`,
    );
  }
  if (final.peak > -1.0) {
    notes.push(`true peak is ${final.peak.toFixed(1)} dBTP — over the -1.0 ceiling, so lossy encoders will clip it`);
  }

  const speech = await speechLoudness(opts);
  const music = opts.music ? await stemLoudness(opts.music, opts.musicGainDb ?? -18) : null;
  if (speech != null) report.speechLufs = speech;
  if (music != null) report.musicLufs = music;

  if (speech != null && music != null) {
    const lead = speech - music;
    report.lead = lead;
    if (lead < SPEECH_LEAD.floor) {
      notes.push(
        `speech sits only ${lead.toFixed(1)} LU above the music — the bed will fight the words. `
        + `Lower \`audio.musicGainDb\` by about ${Math.ceil(SPEECH_LEAD.floor - lead)} dB`,
      );
    } else if (lead > SPEECH_LEAD.ceiling) {
      notes.push(
        `speech sits ${lead.toFixed(1)} LU above the music — the bed is close to inaudible. `
        + `Raise \`audio.musicGainDb\` by about ${Math.floor(lead - SPEECH_LEAD.ceiling)} dB`,
      );
    }
  }

  return report;
}
