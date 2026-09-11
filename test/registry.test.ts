import { expect, test, describe, beforeAll } from 'bun:test';
import { z } from 'zod';
import '@stingo/blocks';
import {
  defineBlock, getBlock, blockNames, allBlocks, hasBlock,
  sceneSchema, parseVideo, blockDuration, blockBroll,
} from '@stingo/schema';
import { plan, Film } from '@stingo/film';
import { THEMES } from '@stingo/themes';
import { box, text } from '@stingo/render';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };

describe('block registry', () => {
  test('the built-in set is registered', () => {
    for (const name of ['title', 'statement', 'code', 'terminal', 'stat', 'list',
                        'chart', 'quote', 'compare', 'broll', 'outro', 'camera']) {
      expect(hasBlock(name), name).toBe(true);
    }
    expect(allBlocks().length).toBeGreaterThanOrEqual(12);
  });

  test('every block carries its own timing and background', () => {
    for (const d of allBlocks()) {
      expect(d.duration.base, `${d.name}.duration.base`).toBeGreaterThan(0);
      expect(typeof d.render, `${d.name}.render`).toBe('function');
      expect(d.describe, `${d.name}.describe`).toBeTruthy();
    }
  });

  test('the planner and compositor read from the registry', () => {
    expect(blockDuration('code').base).toBe(8);
    expect(blockDuration('code').estimate).toBeInstanceOf(Function);
    expect(blockBroll('terminal').kind).toBe('codeRain');
    // an unknown block still yields usable defaults rather than throwing
    expect(blockDuration('nope').base).toBeGreaterThan(0);
    expect(blockBroll('nope').kind).toBe('grid');
  });

  test('an unregistered block is rejected by the schema', () => {
    expect(() => parseVideo({ scenes: [{ block: 'hologram' }] })).toThrow();
  });
});

describe('a block defined from outside the built-in set', () => {
  const NAME = 'testcountdown';

  beforeAll(() => {
    if (hasBlock(NAME)) return;
    defineBlock({
      name: NAME,
      describe: 'A number ticking down, defined in a test file.',
      fields: { from: z.number().int().default(3), label: z.string().optional() },
      duration: { base: 4, estimate: (s: any) => 0.8 + s.from * 0.9 },
      broll: { kind: 'pulse', opacity: 0.5 },
      render: (s: any, c: any) =>
        box({ width: c.stage.w, height: c.stage.h, alignItems: 'center', justifyContent: 'center' },
          text({ fontFamily: c.family('jetbrains mono'), fontSize: 80, color: c.taste.palette.accent },
            String(Math.max(0, s.from - Math.floor(c.t))))),
    });
  });

  test('registering makes it a valid scene with no other wiring', () => {
    expect(blockNames()).toContain(NAME);
    const doc = parseVideo({ scenes: [{ block: NAME, from: 5, label: 'go' }] });
    expect(doc.scenes[0]).toMatchObject({ block: NAME, from: 5, label: 'go' });
  });

  test('its field defaults apply', () => {
    const doc = parseVideo({ scenes: [{ block: NAME }] });
    expect((doc.scenes[0] as any).from).toBe(3);
  });

  test('the planner uses its duration rules without knowing what it is', () => {
    const doc = parseVideo({ canvas: { preset: 'vertical', fps: 30 }, scenes: [{ block: NAME, from: 10 }] });
    const free = { ...THEMES.bootdev, pacing: { ...THEMES.bootdev.pacing, cutOn: 'free' as const } };
    const { timeline } = plan(doc, free as any, grid);
    expect(timeline.cues[0]!.dur).toBeCloseTo(0.8 + 10 * 0.9, 5);   // its own estimate
  });

  test('the compositor uses its b-roll default', () => {
    expect(blockBroll(NAME).kind).toBe('pulse');
  });

  test('it renders through the normal pipeline', async () => {
    const doc = parseVideo({ canvas: { width: 240, height: 426, fps: 30 }, scenes: [{ block: NAME, from: 3 }] });
    const film = await Film.create({ doc, taste: THEMES.bootdev, grid });
    const px = await film.framePixels(10);
    expect(px.byteLength).toBe(240 * 426 * 4);
  }, 30000);

  test('a duplicate name replaces rather than corrupting the registry', () => {
    const before = allBlocks().length;
    defineBlock({
      name: NAME,
      describe: 'replacement',
      fields: { from: z.number().int().default(9) },
      duration: { base: 2 },
      render: () => box({}),
    });
    expect(allBlocks().length).toBe(before);
    expect(getBlock(NAME)!.describe).toBe('replacement');
    expect((parseVideo({ scenes: [{ block: NAME }] }).scenes[0] as any).from).toBe(9);
  });
});
