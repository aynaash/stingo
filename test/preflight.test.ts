import { expect, test, describe } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDoc, loadTaste } from '@stingo/cli/src/load';
import { doctorDoc, looksLikeDoc } from '@stingo/cli/src/doctor';
import { Film, plan, sayWarnings, takeBudget, sheetColumns, guidesSvg, guideZones } from '@stingo/film';
import { parseVideo } from '@stingo/schema';
import { THEMES, DEFAULT_TASTE, themeName } from '@stingo/themes';
import { DEFAULT_GRID } from '@stingo/core';
import '@stingo/blocks';

const withTmp = async (fn: (dir: string) => Promise<void>) => {
  const dir = await mkdtemp(join(tmpdir(), 'stingo-preflight-'));
  try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
};

describe('default taste', () => {
  // The schema defaults `taste` to "default", which for a while was not a name
  // anything could resolve — so the smallest valid document in the docs failed
  // to render, and it was the first thing every new user hit.
  test('the schema default resolves', async () => {
    const doc = parseVideo({ scenes: [{ block: 'title', text: 'It works' }] });
    expect(doc.taste).toBe('default');
    const taste = await loadTaste(doc.taste, '.');
    expect(taste.id).toBe(DEFAULT_TASTE);
  });

  test('"default" is an alias, not a theme of its own', () => {
    expect(themeName('default')).toBe(DEFAULT_TASTE);
    expect(Object.keys(THEMES)).not.toContain('default');
  });

  test('an unknown taste names what to do instead', async () => {
    await expect(loadTaste('nope', '.')).rejects.toThrow(/taste: bootdev/);
  });
});

describe('narration fit', () => {
  const taste = THEMES.bootdev;

  test('warns when say cannot be said in the time the scene has', () => {
    const doc = parseVideo({
      scenes: [{ block: 'statement', text: 'Short', dur: 2, say: 'one two three four five six seven eight nine ten eleven twelve' }],
    });
    const { timeline } = plan(doc, taste, DEFAULT_GRID);
    const warnings = sayWarnings(doc, taste, timeline);
    expect(warnings).toHaveLength(1);
    // the actionable number is how many words to cut, and it has to be there
    expect(warnings[0]).toMatch(/Cut about \d+ words/);
  });

  test('says nothing when the narration fits', () => {
    const doc = parseVideo({ scenes: [{ block: 'statement', text: 'Short', say: 'Three quick words.' }] });
    const { timeline } = plan(doc, taste, DEFAULT_GRID);
    expect(sayWarnings(doc, taste, timeline)).toEqual([]);
  });

  test('a scene with no say is never warned about', () => {
    const doc = parseVideo({ scenes: [{ block: 'statement', text: 'Short', dur: 1 }] });
    const { timeline } = plan(doc, taste, DEFAULT_GRID);
    expect(sayWarnings(doc, taste, timeline)).toEqual([]);
  });
});

describe('take budget', () => {
  test('lists only camera scenes, with the length each needs', () => {
    const doc = parseVideo({
      scenes: [
        { block: 'title', text: 'Intro', id: '01-hook', camera: { src: 'a.mp4' } },
        { block: 'statement', text: 'No camera here' },
        { block: 'title', text: 'Outro', id: '03-verdict', camera: { src: 'b.mp4' } },
      ],
    });
    const { timeline } = plan(doc, THEMES.bootdev, DEFAULT_GRID);
    const budget = takeBudget(doc, timeline);
    expect(budget.map((b) => b.id)).toEqual(['01-hook', '03-verdict']);
    expect(budget.map((b) => b.src)).toEqual(['a.mp4', 'b.mp4']);
    for (const b of budget) expect(b.dur).toBeGreaterThan(0);
  });

  test('is empty for a film with no takes', () => {
    const doc = parseVideo({ scenes: [{ block: 'statement', text: 'All graphics' }] });
    const { timeline } = plan(doc, THEMES.bootdev, DEFAULT_GRID);
    expect(takeBudget(doc, timeline)).toEqual([]);
  });
});

describe('contact sheet layout', () => {
  test('a portrait film packs more per row than a landscape one', () => {
    expect(sheetColumns(12, 1080 / 1920, 2000)).toBeGreaterThan(sheetColumns(12, 1920 / 1080, 2000));
  });

  test('every scene lands in the grid', () => {
    for (const n of [1, 2, 3, 5, 8, 12, 24, 37, 53]) {
      for (const aspect of [1080 / 1920, 1, 1920 / 1080]) {
        for (const width of [800, 2000, 2400, 4000]) {
          const cols = sheetColumns(n, aspect, width);
          expect(cols).toBeGreaterThan(0);
          expect(cols).toBeLessThanOrEqual(n);
          expect(cols * Math.ceil(n / cols)).toBeGreaterThanOrEqual(n);
        }
      }
    }
  });

  // a 53-scene portrait film at 2400px used to come out thirteen columns wide,
  // which is 170px a still — too small to judge anything by
  test('thumbnails stay big enough to read', () => {
    for (const width of [2000, 2400, 3000]) {
      const cols = sheetColumns(53, 1080 / 1920, width);
      expect(width / cols).toBeGreaterThanOrEqual(300);
    }
  });

  test('a wider sheet buys more columns, not bigger cells alone', () => {
    expect(sheetColumns(53, 1080 / 1920, 4000)).toBeGreaterThan(sheetColumns(53, 1080 / 1920, 2000));
  });
});

describe('safe-area guides', () => {
  const doc = (preset: 'vertical' | 'horizontal' | 'square') =>
    parseVideo({ canvas: { preset }, scenes: [{ block: 'statement', text: 'x' }] });

  test('every orientation has zones and draws both safe boxes', () => {
    for (const preset of ['vertical', 'horizontal', 'square'] as const) {
      const d = doc(preset);
      expect(guideZones(d).length).toBeGreaterThan(0);
      const svg = guidesSvg(d, THEMES.bootdev);
      expect(svg).toContain('title-safe 90%');
      expect(svg).toContain('action-safe 95%');
    }
  });

  test('portrait warns about the rail and the caption strip', () => {
    const labels = guideZones(doc('vertical')).map((z) => z.label).join(' ');
    expect(labels).toMatch(/rail/);
    expect(labels).toMatch(/caption/);
  });

  test('no zone falls outside the frame', () => {
    for (const preset of ['vertical', 'horizontal', 'square'] as const) {
      for (const z of guideZones(doc(preset))) {
        expect(z.x).toBeGreaterThanOrEqual(0);
        expect(z.y).toBeGreaterThanOrEqual(0);
        expect(z.x + z.w).toBeLessThanOrEqual(1.0001);
        expect(z.y + z.h).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe('doctor', () => {
  test('tells a document from a taste', async () => {
    expect(await looksLikeDoc('bootdev')).toBe(false);
    expect(await looksLikeDoc('default')).toBe(false);
    expect(await looksLikeDoc('examples/goroutines/video.yaml')).toBe(true);
    // a taste file is not a document, even though both are JSON
    expect(await looksLikeDoc('examples/goroutines/taste.json')).toBe(false);
  });

  test('reports every fault in one pass rather than the first', async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, 'v.yaml'), [
        'title: Broken',
        'canvas: { preset: vertical, fps: 30 }',
        'taste: nosuchtaste',
        'audio: { music: bed.mp3 }',
        'scenes:',
        '  - block: image',
        '    src: missing.png',
        '  - block: statement',
        '    text: Short',
        '    dur: 2',
        '    say: ' + Array(40).fill('word').join(' '),
      ].join('\n'));

      const rep = await doctorDoc(join(dir, 'v.yaml'));
      const areas = new Set(rep.checks.filter((c) => c.level !== 'ok').map((c) => c.area));
      // all four faults, from one run
      expect(areas).toContain('taste');
      expect(areas).toContain('music');
      expect(areas).toContain('images');
      expect(areas).toContain('narration');
      // and it still got far enough to time the film
      expect(rep.checks.some((c) => c.area === 'timing' && c.level === 'ok')).toBe(true);
      expect(rep.errors).toBeGreaterThan(0);
    });
  });

  test('every failing check names a fix', async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, 'v.yaml'), [
        'title: Missing music',
        'audio: { music: bed.mp3 }',
        'scenes: [{ block: statement, text: Short }]',
      ].join('\n'));
      const rep = await doctorDoc(join(dir, 'v.yaml'));
      const music = rep.checks.find((c) => c.area === 'music' && c.level === 'error');
      expect(music).toBeTruthy();
      expect(music!.fix).toMatch(/audio:/);
    });
  });

  test('a healthy document reports no errors', async () => {
    const rep = await doctorDoc('examples/goroutines/video.yaml');
    expect(rep.errors).toBe(0);
  });
});

describe('asset paths', () => {
  // camera sources and audio were resolved next to the document; images and
  // backdrops were not, so they only worked from the one directory
  test('an image beside the document resolves from anywhere', async () => {
    await withTmp(async (dir) => {
      await Bun.write(join(dir, 'shot.png'), new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
      await Bun.write(join(dir, 'v.yaml'), [
        'title: Image paths',
        'scenes:',
        '  - block: image',
        '    src: shot.png',
        '  - block: statement',
        '    text: x',
        '    bg: { src: shot.png }',
      ].join('\n'));
      const doc = await loadDoc(join(dir, 'v.yaml'));
      expect((doc.scenes[0] as any).src).toBe(join(dir, 'shot.png'));
      expect(doc.scenes[1]!.bg!.src).toBe(join(dir, 'shot.png'));
    });
  });
});

describe('word spacing', () => {
  /** Ink extents of every glyph run drawn in a colour, left to right.
   *  satori emits one path per text node, so a wordStack gives one per word. */
  const runs = (svg: string, fill: string) =>
    [...svg.matchAll(new RegExp(`<path fill="${fill}" d="([^"]+)"`, 'g'))]
      .map((m) => {
        const n = m[1]!.match(/-?\d+(\.\d+)?/g)!.map(Number);
        const xs = n.filter((_, i) => i % 2 === 0);
        return { min: Math.min(...xs), max: Math.max(...xs) };
      })
      .sort((a, b) => a.min - b.min);

  // The bug this guards against was invisible: satori reads the two-value
  // `gap: "11px 48px"` shorthand as a single value and applies the *first* to
  // both axes, with no warning. The words of a headline therefore sat a fifth
  // of a space apart, and "It works" read as one word whose second half
  // appeared to be set in a lighter weight. Nothing in the output said so —
  // both words were, and are, the same face at the same weight.
  test('two words of a headline are about a space apart', async () => {
    const taste = THEMES.bootdev;
    const doc = parseVideo({
      canvas: { preset: 'vertical', fps: 30 },
      scenes: [{ block: 'title', text: 'It works' }],
    });
    const film = await Film.create({ doc, taste, grid: DEFAULT_GRID, hud: false, noCamera: true });
    try {
      // late enough that both words have finished animating in
      const svg = await film.frameSvg(film.frameCount - 5);
      const words = runs(svg, taste.palette.text);
      expect(words).toHaveLength(2);

      const gap = words[1]!.min - words[0]!.max;
      // JetBrains Mono is monospaced at 0.6em, so a word gap should be within
      // sidebearings of that. A fifth of it is the regression.
      const em = words[0]!.max - words[0]!.min;   // "It" ink, ~1.1em wide
      expect(gap / em).toBeGreaterThan(0.25);
    } finally {
      await film.close();
    }
  });

  test('no style asks satori for a two-value gap', async () => {
    // the shorthand is not supported and fails silently, so it must not appear
    for (const f of ['packages/blocks/src/text.ts', 'packages/blocks/src/captionlayer.ts']) {
      const src = await Bun.file(f).text();
      const shorthand = /\bgap:\s*[`'"][^`'"]*\bpx\s+[^`'"]*px[`'"]/.exec(src);
      expect(shorthand?.[0], `${f} uses a two-value gap shorthand`).toBeUndefined();
    }
  });
});
