import { expect, test, describe } from 'bun:test';
import '@stingo/blocks';
import { transitionFrame, Film, type TransitionKind } from '@stingo/film';
import { parseVideo, TasteProfile } from '@stingo/schema';
import { THEMES } from '@stingo/themes';

const PALETTE = THEMES.bootdev.palette;
const base = {
  sceneDur: 6, duration: 0.4, isFirst: false, isLast: false,
  index: 1, w: 1080, h: 1920, palette: PALETTE,
};
const ALL: TransitionKind[] = ['fade', 'wipe', 'whip', 'slide', 'glitch'];

describe('transitionFrame', () => {
  test('nothing fires in the middle of a scene', () => {
    for (const kind of [...ALL, 'cut' as const]) {
      expect(transitionFrame({ ...base, kind, local: 3 }), kind).toEqual({});
    }
  });

  test('cut never does anything, even at the boundary', () => {
    expect(transitionFrame({ ...base, kind: 'cut', local: 5.9 })).toEqual({});
  });

  test('a zero duration disables every kind', () => {
    for (const kind of ALL) {
      expect(transitionFrame({ ...base, kind, duration: 0, local: 5.99 }), kind).toEqual({});
    }
  });

  test('every kind produces something at the boundary', () => {
    for (const kind of ALL) {
      const leaving = transitionFrame({ ...base, kind, local: 5.85 });
      expect(Object.keys(leaving).length, `${kind} leaving`).toBeGreaterThan(0);
      const arriving = transitionFrame({ ...base, kind, local: 0.1 });
      expect(Object.keys(arriving).length, `${kind} arriving`).toBeGreaterThan(0);
    }
  });

  test('the first scene has nothing to arrive from', () => {
    for (const kind of ALL) {
      expect(transitionFrame({ ...base, kind, isFirst: true, local: 0.1 }), kind).toEqual({});
    }
  });

  test('the last scene has nothing to leave to', () => {
    for (const kind of ALL) {
      expect(transitionFrame({ ...base, kind, isLast: true, local: 5.85 }), kind).toEqual({});
    }
  });

  test('a move longer than the scene is clamped to half of it', () => {
    // without the clamp a 10s move on a 6s scene would have the two halves
    // overlapping, and the scene would never be still
    const greedy = { ...base, sceneDur: 6, duration: 10, kind: 'slide' as const };
    expect(transitionFrame({ ...greedy, local: 3 }), 'the midpoint should be still').toEqual({});
    expect(Object.keys(transitionFrame({ ...greedy, local: 5.9 })).length).toBeGreaterThan(0);
  });

  test('slide and whip push the same way, whip further', () => {
    const px = (f: { transform?: string }) => parseFloat(/translateX\(([-\d.]+)%\)/.exec(f.transform ?? '')?.[1] ?? '0');
    const s = px(transitionFrame({ ...base, kind: 'slide', local: 0.1 }));
    const w = px(transitionFrame({ ...base, kind: 'whip', local: 0.1 }));
    expect(s).toBeLessThan(0);              // arriving from the right, so still left of home
    expect(w).toBeLessThan(s);              // whip travels further
  });

  test('wipe draws a covering bar and a leading edge', () => {
    const f = transitionFrame({ ...base, kind: 'wipe', local: 5.85 });
    expect(f.overlay).toContain('<rect');
    expect(f.overlay).toContain(PALETTE.accent);   // the edge
    expect(f.overlay).toContain(PALETTE.bg);       // the bar
  });

  test('glitch works on pixels, not markup', () => {
    const f = transitionFrame({ ...base, kind: 'glitch', local: 5.95 });
    expect(f.pixel).toBeInstanceOf(Function);
    expect(f.overlay).toBeUndefined();
  });

  test('the glitch is deterministic — the same frame tears identically', () => {
    const at = () => transitionFrame({ ...base, kind: 'glitch', local: 5.95 }).pixel!;
    const make = () => {
      const px = Buffer.alloc(64 * 64 * 4);
      for (let i = 0; i < px.length; i += 4) {
        const on = ((i >> 5) % 2) === 0;
        px[i] = on ? 220 : 30; px[i + 1] = 120; px[i + 2] = 60; px[i + 3] = 255;
      }
      return px;
    };
    const a = make(), b = make();
    at()(a, 64, 64);
    at()(b, 64, 64);
    expect(Buffer.compare(a, b)).toBe(0);
  });

  test('glitch actually changes the pixels', () => {
    // a flat colour is unchanged by displacement, so the fixture is striped
    const W = 128, H = 128;
    const px = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, on = (x >> 3) % 2 === 0;
      px[i] = on ? 240 : 20; px[i + 1] = on ? 160 : 30; px[i + 2] = on ? 80 : 40; px[i + 3] = 255;
    }
    const before = Buffer.from(px);
    transitionFrame({ ...base, kind: 'glitch', local: 5.95, w: W, h: H }).pixel!(px, W, H);
    expect(Buffer.compare(px, before)).not.toBe(0);
  });
});

describe('transitions through a real render', () => {
  const doc = parseVideo({
    canvas: { width: 360, height: 640, fps: 30 },
    scenes: [{ block: 'statement', text: 'one', dur: '4s' }, { block: 'statement', text: 'two', dur: '4s' }],
  });
  const withKind = (kind: TransitionKind) =>
    TasteProfile.parse({ ...THEMES.bootdev, pacing: { ...THEMES.bootdev.pacing, cutOn: 'free' },
      transition: { kind, duration: 0.4 } });

  test('each kind renders a frame that differs from a plain cut', async () => {
    const cut = await Film.create({ doc, taste: withKind('cut'), hud: false });
    const cutPx = await cut.framePixels(Math.round(4.1 * 30));
    for (const kind of ALL) {
      const f = await Film.create({ doc, taste: withKind(kind), hud: false });
      const px = await f.framePixels(Math.round(4.1 * 30));
      expect(Buffer.compare(px, cutPx), `${kind} looked identical to a cut`).not.toBe(0);
    }
  }, 90000);

  test('a slide actually moves the picture sideways', async () => {
    // only near-white pixels, so the measurement follows the type rather than
    // the b-roll behind it
    const centroid = (px: Buffer, w: number, h: number) => {
      let sum = 0, n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (px[i]! > 210 && px[i + 1]! > 210 && px[i + 2]! > 210) { sum += x; n++; }
      }
      return n ? sum / n : w / 2;
    };
    // Measured on the LEAVING half, and early in it. The window is narrow from
    // both ends: just after a cut the incoming block has not faded its type in
    // yet, and late in the leaving half the block's own exit fade has already
    // taken the type away. 3.8s of a 4s scene is where both a visible glyph and
    // a real displacement overlap.
    const at = Math.round(3.8 * 30);
    const cut = await (await Film.create({ doc, taste: withKind('cut'), hud: false })).framePixels(at);
    const slid = await (await Film.create({ doc, taste: withKind('slide'), hud: false })).framePixels(at);
    expect(centroid(slid, 360, 640)).toBeLessThan(centroid(cut, 360, 640) - 6);
  }, 60000);
});
