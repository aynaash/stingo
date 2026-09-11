import { expect, test, describe } from 'bun:test';
import { interpolate, spring, rng, EASINGS, ease, toSeconds, snap, speakDuration, Timeline, beat, bar } from '@stingo/core';

describe('interpolate', () => {
  test('maps a range', () => {
    expect(interpolate(0.5, [0, 1], [0, 100], { ease: 'linear' })).toBe(50);
  });
  test('clamps outside the range by default', () => {
    expect(interpolate(-5, [0, 1], [0, 100])).toBe(0);
    expect(interpolate(5, [0, 1], [0, 100])).toBe(100);
  });
  test('handles multi-stop ranges', () => {
    expect(interpolate(1.5, [0, 1, 2], [0, 10, 0], { ease: 'linear' })).toBe(5);
  });
  test('rejects mismatched input/output', () => {
    expect(() => interpolate(0, [0, 1], [0])).toThrow();
  });
});

describe('easings', () => {
  test('all are anchored at 0 and 1', () => {
    for (const [name, fn] of Object.entries(EASINGS)) {
      expect(Math.abs(fn(0)), `${name}(0)`).toBeLessThan(1e-6);
      expect(Math.abs(fn(1) - 1), `${name}(1)`).toBeLessThan(1e-6);
    }
  });
  test('unknown names fall back rather than throwing', () => {
    expect(ease('not-a-curve')(0.5)).toBe(EASINGS['expo.out']!(0.5));
  });
});

describe('spring', () => {
  test('starts at rest and settles at 1', () => {
    expect(spring(0)).toBe(0);
    expect(Math.abs(spring(5) - 1)).toBeLessThan(0.01);
  });
  test('underdamped springs overshoot', () => {
    let max = 0;
    for (let t = 0; t < 2; t += 0.01) max = Math.max(max, spring(t, { stiffness: 190, damping: 12 }));
    expect(max).toBeGreaterThan(1);
  });
});

describe('rng', () => {
  test('is deterministic for a seed', () => {
    expect(rng(42)()).toBe(rng(42)());
  });
  test('differs across seeds and stays in range', () => {
    expect(rng(1)()).not.toBe(rng(2)());
    const r = rng(7);
    for (let i = 0; i < 500; i++) { const v = r(); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(1); }
  });
});

describe('musical time', () => {
  const g = { bpm: 120, offset: 0, beatsPerBar: 4 };
  test('parses every time form', () => {
    expect(toSeconds(4, g)).toBe(4);
    expect(toSeconds('4s', g)).toBe(4);
    expect(toSeconds('8b', g)).toBe(4);       // 8 beats at 120bpm
    expect(toSeconds('2bar', g)).toBe(4);     // 2 bars of 4
    expect(toSeconds('1:30', g)).toBe(90);
  });
  test('rejects nonsense', () => {
    expect(() => toSeconds('soon' as any, g)).toThrow();
  });
  test('snaps to the grid', () => {
    expect(snap(3.1, 'bar', g)).toBe(4);
    expect(snap(3.1, 'beat', g)).toBe(3);
    expect(snap(3.1, 'free', g)).toBe(3.1);
  });
  test('beat and bar helpers respect offset', () => {
    const off = { ...g, offset: 0.5 };
    expect(beat(4, off)).toBe(2.5);
    expect(bar(1, off)).toBe(2.5);
  });
  test('estimates speech length', () => {
    expect(speakDuration('one two three four five', 150, 0)).toBeCloseTo(2, 5);
    expect(speakDuration('', 150, 0.3)).toBe(0);
  });
});

describe('Timeline', () => {
  const tl = new Timeline([
    { id: 'a', index: 0, block: 'title', start: 0, end: 4, dur: 4 },
    { id: 'b', index: 1, block: 'code', start: 4, end: 10, dur: 6 },
  ], { bpm: 120, offset: 0, beatsPerBar: 4 }, 30);

  test('reports duration and frame count', () => {
    expect(tl.duration).toBe(10);
    expect(tl.frameCount).toBe(300);
  });
  test('finds the cue at a time with local progress', () => {
    const hit = tl.at(7)!;
    expect(hit.cue.id).toBe('b');
    expect(hit.local).toBe(3);
    expect(hit.p).toBeCloseTo(0.5, 5);
  });
  test('boundaries belong to the later cue', () => {
    expect(tl.at(4)!.cue.id).toBe('b');
  });
  test('past the end clamps to the last cue', () => {
    expect(tl.at(99)!.cue.id).toBe('b');
  });
});
