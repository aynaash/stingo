import { test, expect, describe, beforeAll } from 'bun:test';
import { loadFonts } from '@stingo/render';
import { metricsFor, measureLine, wrapLines, layoutTokens, fitText, readMetrics, type FontMetrics } from '@stingo/render';

let mono: FontMetrics;   // JetBrains Mono — every glyph the same advance
let prop: FontMetrics;   // Inter — proportional

beforeAll(async () => {
  const fonts = await loadFonts('assets/fonts');
  mono = metricsFor(fonts.find((f) => /JetBrains/i.test(f.name) && f.weight === 400)!.data);
  prop = metricsFor(fonts.find((f) => /Inter/i.test(f.name) && f.weight === 400)!.data);
});

describe('font metrics', () => {
  test('reads a real font', () => {
    expect(mono.unitsPerEm).toBe(1000);
    expect(mono.cmap.size).toBeGreaterThan(100);
    expect(prop.unitsPerEm).toBe(2048);
  });

  test('JetBrains Mono measures its documented 0.6 em advance', () => {
    expect(measureLine('X', mono, { size: 100 })).toBeCloseTo(60, 5);
  });

  test('monospace width is exactly linear in character count', () => {
    const one = measureLine('X', mono, { size: 100 });
    expect(measureLine('X'.repeat(10), mono, { size: 100 })).toBeCloseTo(one * 10, 5);
  });

  test('a proportional font is not linear — narrow glyphs are narrower', () => {
    expect(measureLine('iii', prop, { size: 100 }))
      .toBeLessThan(measureLine('WWW', prop, { size: 100 }));
  });

  test('width scales with size', () => {
    expect(measureLine('hello', prop, { size: 200 }))
      .toBeCloseTo(measureLine('hello', prop, { size: 100 }) * 2, 4);
  });

  test('tracking adds one gap between each pair, not after the last', () => {
    const plain = measureLine('abcd', mono, { size: 100 });
    expect(measureLine('abcd', mono, { size: 100, tracking: 0.1 })).toBeCloseTo(plain + 3 * 10, 4);
  });

  test('an unmapped codepoint falls back rather than measuring zero', () => {
    expect(measureLine('\u{10FFFD}', mono, { size: 100 })).toBeGreaterThan(0);
  });

  test('the empty string is zero wide', () => {
    expect(measureLine('', mono, { size: 100 })).toBe(0);
  });

  test('metrics are cached per font buffer', async () => {
    const fonts = await loadFonts('assets/fonts');
    const data = fonts[0]!.data;
    expect(metricsFor(data)).toBe(metricsFor(data));
  });

  test('a truncated font is rejected, not silently mis-measured', () => {
    expect(() => readMetrics(new ArrayBuffer(8))).toThrow();
  });
});

describe('wrapping', () => {
  test('breaks lines at the box width', () => {
    const lines = wrapLines('one two three four five six', mono, { size: 100 }, 300);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(measureLine(l, mono, { size: 100 })).toBeLessThanOrEqual(300);
  });

  test('text that fits stays on one line', () => {
    expect(wrapLines('short', mono, { size: 20 }, 1000)).toEqual(['short']);
  });

  test('a word longer than the line is broken rather than left to overflow', () => {
    const word = 'pneumonoultramicroscopicsilicovolcanoconiosis';
    const tokens = layoutTokens(word, mono, { size: 100 }, 300);
    expect(tokens.length).toBeGreaterThan(1);
    for (const t of tokens) expect(measureLine(t, mono, { size: 100 })).toBeLessThanOrEqual(300);
    expect(tokens.join('')).toBe(word);   // breaking must not lose characters
  });

  test('ordinary words are never broken', () => {
    expect(layoutTokens('the quick brown fox', mono, { size: 20 }, 1000))
      .toEqual(['the', 'quick', 'brown', 'fox']);
  });
});

describe('fitting', () => {
  const box = { maxWidth: 800, maxHeight: 400 };

  test('text that already fits is left alone', () => {
    const r = fitText('short', mono, 40, box);
    expect(r.size).toBe(40);
    expect(r.shrunk).toBe(false);
    expect(r.overflows).toBe(false);
  });

  test('text too wide is shrunk until it fits', () => {
    const r = fitText('a very long headline that will not fit at this size', mono, 120, box);
    expect(r.size).toBeLessThan(120);
    expect(r.shrunk).toBe(true);
    expect(r.width).toBeLessThanOrEqual(box.maxWidth + 0.01);
  });

  test('too many lines shrinks the text too', () => {
    const many = Array.from({ length: 12 }, (_, i) => `word${i}`).join(' ');
    const r = fitText(many, mono, 80, box);
    expect(r.shrunk).toBe(true);
    expect(r.height).toBeLessThanOrEqual(box.maxHeight + 0.01);
    expect(r.overflows).toBe(false);
  });

  test('a scene with far too much text is reported, not silently mangled', () => {
    // the floor stops the tool pretending it solved a scene that simply has
    // too many words in it; the author has to be told
    const tooMuch = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    const r = fitText(tooMuch, mono, 80, box);
    expect(r.overflows).toBe(true);
    expect(r.size).toBeGreaterThanOrEqual(80 * 0.45 - 0.01);
  });

  test('the floor is respected even when nothing can fit', () => {
    const r = fitText('x'.repeat(4000), mono, 100, { maxWidth: 50, maxHeight: 50, floor: 0.6 });
    expect(r.size).toBeGreaterThanOrEqual(60 - 0.01);
    expect(r.overflows).toBe(true);   // the caller is told, rather than misled
  });

  test('wrap:false keeps one line and shrinks to the width', () => {
    const r = fitText('1,234,567,890,123', mono, 200, { maxWidth: 400, wrap: false, floor: 0.1 });
    expect(r.lines).toHaveLength(1);
    expect(r.width).toBeLessThanOrEqual(400.01);
    expect(r.overflows).toBe(false);
  });

  test('height is not checked when no maxHeight is given', () => {
    const r = fitText('one two three four five', mono, 60, { maxWidth: 200 });
    expect(r.overflows).toBe(false);
    expect(r.width).toBeLessThanOrEqual(200.01);
  });

  test('empty text does not loop or divide by zero', () => {
    const r = fitText('', mono, 50, box);
    expect(r.size).toBe(50);
    expect(r.lines).toEqual([]);
  });
});
