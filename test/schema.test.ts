import { expect, test, describe } from 'bun:test';
// parsing a document requires the block set: the Scene schema is composed from
// whatever is registered, so importing the blocks is what makes them valid
import '@stingo/blocks';
import { TasteProfile, parseVideo, Broll, CANVAS_PRESETS } from '@stingo/schema';
import { THEMES } from '@stingo/themes';

describe('TasteProfile', () => {
  test('fills nested defaults', () => {
    const t = TasteProfile.parse({});
    expect(t.palette.accent).toBe('#a78bfa');
    expect(t.motion.personality).toBe('snappy');
    expect(t.motion.spring.stiffness).toBe(170);
    expect(t.type.display.weight).toBe(800);
    expect(t.texture.vignette).toBe(0.35);
  });
  test('rejects a bad colour', () => {
    expect(() => TasteProfile.parse({ palette: { accent: 'purple' } })).toThrow();
  });
  test('every built-in theme is valid', () => {
    for (const [id, theme] of Object.entries(THEMES)) {
      expect(() => TasteProfile.parse(theme), id).not.toThrow();
    }
  });
});

describe('VideoDoc', () => {
  test('resolves canvas presets and orientation', () => {
    const v = parseVideo({ canvas: { preset: 'vertical' }, scenes: [{ block: 'title', text: 'x' }] });
    expect(v.canvas.width).toBe(CANVAS_PRESETS.vertical.width);
    expect(v.canvas.orientation).toBe('portrait');
    const h = parseVideo({ canvas: { preset: 'horizontal' }, scenes: [{ block: 'title', text: 'x' }] });
    expect(h.canvas.orientation).toBe('landscape');
  });
  test('requires at least one scene', () => {
    expect(() => parseVideo({ scenes: [] })).toThrow();
  });
  test('rejects an unknown block', () => {
    expect(() => parseVideo({ scenes: [{ block: 'hologram' }] })).toThrow();
  });
  test('accepts musical durations', () => {
    const v = parseVideo({ scenes: [{ block: 'title', text: 'x', dur: '8b' }] });
    expect(v.scenes[0]!.dur).toBe('8b');
  });
  test('rejects a malformed duration', () => {
    expect(() => parseVideo({ scenes: [{ block: 'title', text: 'x', dur: 'a while' }] })).toThrow();
  });
});

describe('Broll', () => {
  test('defaults are complete', () => {
    const b = Broll.parse({});
    expect(b.kind).toBe('grid');
    expect(b.opacity).toBe(0.5);
    expect(b.seed).toBe(1);
  });
  test('rejects an unknown kind', () => {
    expect(() => Broll.parse({ kind: 'lava' })).toThrow();
  });
});
