import { expect, test, describe } from 'bun:test';
import '@stingo/blocks';
import { parseVideo, blockDuration, blockBroll, hasBlock } from '@stingo/schema';
import { Film, plan, estimateDuration } from '@stingo/film';
import { THEMES } from '@stingo/themes';
import { diagram, film } from '@hersidev/stingo';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };
const doc = (scene: any, canvas: any = { width: 300, height: 533, fps: 30 }) =>
  parseVideo({ title: 't', canvas, scenes: [scene] });

const SAMPLE = {
  block: 'diagram',
  title: 'request path',
  nodes: [
    { id: 'client', label: 'Client', at: [0, 0], kind: 'actor' },
    { id: 'api', label: 'API', at: [1, 0], accent: true },
    { id: 'db', label: 'Postgres', at: [1, 1], kind: 'store' },
  ],
  edges: [
    { from: 'client', to: 'api', label: 'HTTPS' },
    { from: 'api', to: 'db', label: 'SQL', style: 'dashed' },
  ],
};

describe('diagram block', () => {
  test('is registered with its own timing and background', () => {
    expect(hasBlock('diagram')).toBe(true);
    expect(blockDuration('diagram').estimate).toBeInstanceOf(Function);
    expect(blockBroll('diagram').kind).toBe('grid');
  });

  test('length grows with the number of nodes and edges', () => {
    const nodes = (n: number) => Array.from({ length: n }, (_, i) => ({
      id: `n${i}`, label: `N${i}`, at: [i % 3, Math.floor(i / 3)] as [number, number],
    }));
    const at = (n: number) => estimateDuration(
      doc({ block: 'diagram', nodes: nodes(n), edges: [] }).scenes[0]!, THEMES.bootdev, grid);
    expect(at(10)).toBeGreaterThan(at(4));
    expect(at(4)).toBe(5);                       // the floor, for a small diagram
    expect(at(10)).toBeCloseTo(2.4 + 10 * 0.6, 5);
  });

  test('requires at least one node', () => {
    expect(() => doc({ block: 'diagram', nodes: [] })).toThrow();
  });

  test('rejects a malformed position', () => {
    expect(() => doc({ block: 'diagram', nodes: [{ id: 'a', label: 'A', at: [0] }] })).toThrow();
  });

  test('an edge to a missing node does not crash the render', async () => {
    const f = await Film.create({
      doc: doc({ ...SAMPLE, edges: [{ from: 'client', to: 'ghost-that-does-not-exist' }] }),
      taste: THEMES.bootdev, grid,
    });
    expect((await f.framePixels(20)).byteLength).toBe(300 * 533 * 4);
  }, 30000);

  test('renders in both orientations', async () => {
    for (const canvas of [{ width: 300, height: 533, fps: 30 }, { width: 533, height: 300, fps: 30 }]) {
      const f = await Film.create({ doc: doc(SAMPLE, canvas), taste: THEMES.bootdev, grid });
      expect((await f.framePixels(25)).byteLength).toBe(canvas.width * canvas.height * 4);
    }
  }, 40000);

  test('renders deterministically', async () => {
    const f = await Film.create({ doc: doc(SAMPLE), taste: THEMES.bootdev, grid });
    expect(Buffer.compare(await f.framePixels(18), await f.framePixels(18))).toBe(0);
  }, 30000);

  test('the diagram changes as nodes and edges arrive', async () => {
    const f = await Film.create({ doc: doc(SAMPLE), taste: THEMES.bootdev, grid });
    expect(Buffer.compare(await f.framePixels(2), await f.framePixels(40))).not.toBe(0);
  }, 30000);

  test('the builder produces the same document as YAML would', () => {
    const built = film('t').canvas(300, 533).add(
      diagram('request path')
        .node('client', 'Client', [0, 0], { kind: 'actor' })
        .node('api', 'API', [1, 0], { accent: true })
        .node('db', 'Postgres', [1, 1], { kind: 'store' })
        .edge('client', 'api', { label: 'HTTPS' })
        .edge('api', 'db', { label: 'SQL', style: 'dashed' }),
    ).toDoc();
    expect(built.scenes[0]).toEqual(doc(SAMPLE).scenes[0] as any);
  });
});
