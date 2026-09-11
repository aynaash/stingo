import { expect, test, describe } from 'bun:test';
import { fft, hann, analyzeBeats, estimateTempo, onsetEnvelope, decodePcm } from '@stingo/audio';

describe('fft', () => {
  test('locates a pure tone in the right bin', () => {
    const n = 1024, re = new Float32Array(n), im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 100 * i) / n);
    fft(re, im);
    let peak = 0, at = 0;
    for (let k = 1; k < n / 2; k++) { const m = Math.hypot(re[k]!, im[k]!); if (m > peak) { peak = m; at = k; } }
    expect(at).toBe(100);
  });
  test('rejects non-power-of-two lengths', () => {
    expect(() => fft(new Float32Array(100), new Float32Array(100))).toThrow(/power of two/);
  });
  test('hann window is symmetric and zero at the edges', () => {
    const w = hann(64);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[63]).toBeCloseTo(0, 6);
    expect(w[10]).toBeCloseTo(w[53]!, 6);
  });
});

describe('beat detection', () => {
  // fixtures generated at known tempos during the build
  const cases = [[90, '/tmp/beat90.wav'], [128, '/tmp/beat128.wav'], [140, '/tmp/beat140.wav']] as const;

  for (const [truth, file] of cases) {
    test(`detects ${truth} BPM within 3%`, async () => {
      if (!(await Bun.file(file).exists())) return;
      const a = await analyzeBeats(file);
      const err = Math.abs(a.bpm - truth) / truth;
      expect(err, `got ${a.bpm}`).toBeLessThan(0.03);
      expect(a.confidence).toBeGreaterThan(0.2);
    });
  }

  test('an explicit bpm overrides detection', async () => {
    if (!(await Bun.file('/tmp/beat128.wav').exists())) return;
    const a = await analyzeBeats('/tmp/beat128.wav', { bpm: 100 });
    expect(a.bpm).toBe(100);
    expect(a.confidence).toBe(1);
  });

  test('the downbeat lands within one beat of the start', async () => {
    if (!(await Bun.file('/tmp/beat128.wav').exists())) return;
    const a = await analyzeBeats('/tmp/beat128.wav');
    expect(a.offset).toBeGreaterThanOrEqual(0);
    expect(a.offset).toBeLessThan(60 / a.bpm);
  });

  test('half-tempo is not chosen over the true tempo', async () => {
    if (!(await Bun.file('/tmp/beat140.wav').exists())) return;
    const a = await analyzeBeats('/tmp/beat140.wav');
    expect(a.bpm, 'octave error: detected half tempo').toBeGreaterThan(100);
  });
});
