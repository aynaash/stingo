import { fft, hann } from './fft';
import { decodePcm, type Pcm } from './decode';
import type { BeatGrid } from '@stingo/core';

export interface BeatAnalysis extends BeatGrid {
  confidence: number;
  duration: number;
  /** onset strength per analysis frame, and the seconds-per-frame step */
  envelope: Float32Array;
  envelopeHop: number;
}

const FFT_SIZE = 1024;
const HOP = 512;

/** Spectral flux: total positive change in magnitude between frames.
 *  Percussive hits raise many bins at once, so this spikes on beats. */
export function onsetEnvelope(pcm: Pcm, fftSize = FFT_SIZE, hop = HOP, maxHz?: number): { env: Float32Array; hopSec: number } {
  const { data } = pcm;
  const frames = Math.max(0, Math.floor((data.length - fftSize) / hop) + 1);
  const win = hann(fftSize);
  const allBins = fftSize / 2;
  // limiting to low bins isolates kick energy, which marks the downbeat far
  // more reliably than full-band flux (hats spike the broadband flux harder)
  const bins = maxHz ? Math.max(4, Math.min(allBins, Math.round((maxHz / (pcm.sampleRate / 2)) * allBins))) : allBins;
  const env = new Float32Array(frames);
  let prev = new Float32Array(bins);
  const re = new Float32Array(fftSize), im = new Float32Array(fftSize);

  for (let f = 0; f < frames; f++) {
    const off = f * hop;
    for (let i = 0; i < fftSize; i++) { re[i] = data[off + i]! * win[i]!; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    const cur = new Float32Array(bins);
    for (let k = 0; k < bins; k++) {
      // log compression keeps loud sections from dominating the envelope
      const mag = Math.log1p(Math.hypot(re[k]!, im[k]!) * 8);
      cur[k] = mag;
      const d = mag - prev[k]!;
      if (d > 0) flux += d;
    }
    env[f] = flux;
    prev = cur;
  }

  // subtract a local mean so the envelope is comparable across the track
  const smoothed = new Float32Array(frames);
  const W = 12;
  for (let f = 0; f < frames; f++) {
    let sum = 0, n = 0;
    for (let i = Math.max(0, f - W); i <= Math.min(frames - 1, f + W); i++) { sum += env[i]!; n++; }
    smoothed[f] = Math.max(0, env[f]! - sum / n);
  }
  return { env: smoothed, hopSec: hop / pcm.sampleRate };
}

/** Tempo by autocorrelating the onset envelope over musically plausible lags. */
export function estimateTempo(env: Float32Array, hopSec: number, minBpm = 70, maxBpm = 180): { bpm: number; confidence: number } {
  const minLag = Math.floor(60 / maxBpm / hopSec);
  const maxLag = Math.ceil(60 / minBpm / hopSec);
  let best = { lag: minLag, score: -1 };
  let total = 0;

  // Autocorrelation scores double-length lags just as highly as the true beat
  // period, so raw argmax lands on half-tempo about as often as not. A
  // log-normal prior centred on ~125 BPM breaks the tie the way a listener would.
  const prior = (bpm: number) => Math.exp(-0.5 * ((Math.log2(bpm / 125)) / 0.55) ** 2);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i]! * env[i + lag]!;
    const raw = sum / (env.length - lag);
    const score = raw * prior(60 / (lag * hopSec));
    total += score;
    if (score > best.score) best = { lag, score };
  }

  const mean = total / (maxLag - minLag + 1);

  // integer lags quantise tempo badly (at 128 BPM one lag step is ~6 BPM),
  // so fit a parabola through the peak and its neighbours for sub-frame precision
  const scoreAt = (lag: number) => {
    if (lag < minLag || lag > maxLag) return 0;
    let sum = 0;
    for (let i = 0; i + lag < env.length; i++) sum += env[i]! * env[i + lag]!;
    return (sum / (env.length - lag)) * prior(60 / (lag * hopSec));
  };
  const y0 = scoreAt(best.lag - 1), y1 = best.score, y2 = scoreAt(best.lag + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const refinedLag = best.lag + Math.max(-0.5, Math.min(0.5, shift));
  const bpm = 60 / (refinedLag * hopSec);
  // how far the winning lag stands above the average lag — a flat curve means no beat
  const confidence = mean > 0 ? Math.min(1, (best.score / mean - 1) / 1.5) : 0;
  return { bpm: Math.round(bpm * 10) / 10, confidence: Math.max(0, confidence) };
}

/** Find which phase of the tempo grid the downbeats actually sit on. */
export function estimateOffset(env: Float32Array, hopSec: number, bpm: number): number {
  const period = 60 / bpm / hopSec;
  let best = { phase: 0, score: -1 };
  const steps = Math.max(8, Math.floor(period));
  for (let s = 0; s < steps; s++) {
    const phase = (s / steps) * period;
    let score = 0;
    for (let b = 0; ; b++) {
      const idx = Math.round(phase + b * period);
      if (idx >= env.length) break;
      score += env[idx]!;
    }
    if (score > best.score) best = { phase, score };
  }
  return best.phase * hopSec;
}

/** Peak-pick the envelope into discrete onset times. */
export function pickOnsets(env: Float32Array, hopSec: number, sensitivity = 1.4): number[] {
  let mean = 0;
  for (const v of env) mean += v;
  mean /= env.length || 1;
  const thresh = mean * sensitivity;
  const out: number[] = [];
  let last = -Infinity;
  for (let i = 1; i < env.length - 1; i++) {
    const v = env[i]!;
    if (v > thresh && v >= env[i - 1]! && v > env[i + 1]!) {
      const t = i * hopSec;
      if (t - last > 0.09) { out.push(Number(t.toFixed(3))); last = t; }
    }
  }
  return out;
}

/** Full analysis: decode → envelope → tempo → phase → onsets. */
export async function analyzeBeats(file: string, opts: { beatsPerBar?: number; bpm?: number } = {}): Promise<BeatAnalysis> {
  const pcm = await decodePcm(file);
  const { env, hopSec } = onsetEnvelope(pcm);
  const tempo = opts.bpm ? { bpm: opts.bpm, confidence: 1 } : estimateTempo(env, hopSec);
  // phase comes from the low band so downbeats land on kicks, not hats
  const { env: lowEnv } = onsetEnvelope(pcm, FFT_SIZE, HOP, 220);
  const rawOffset = estimateOffset(lowEnv, hopSec, tempo.bpm);
  // the analysis window delays detected onsets by about half its length
  const latency = (FFT_SIZE / 2 / pcm.sampleRate);
  const period = 60 / tempo.bpm;
  const offset = ((rawOffset - latency) % period + period) % period;
  return {
    bpm: tempo.bpm, offset: Number(offset.toFixed(3)), beatsPerBar: opts.beatsPerBar ?? 4,
    confidence: Number(tempo.confidence.toFixed(3)), duration: pcm.duration,
    onsets: pickOnsets(env, hopSec), envelope: env, envelopeHop: hopSec,
  };
}
