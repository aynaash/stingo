import { expect, test, describe } from 'bun:test';
import { film, title, statement, code, terminal, stat, list, chart, quote, compare, broll, outro, VERSION } from 'stingo';
import { plan, Film } from 'stingo';
import { THEMES } from 'stingo';

const grid = { bpm: 120, offset: 0, beatsPerBar: 4 };

describe('public entry point', () => {
  test('exports a version', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
  test('re-exports the whole pipeline from one import', async () => {
    const mod = await import('stingo');
    for (const name of ['film', 'Film', 'renderVideo', 'plan', 'derive', 'audit', 'analyzeBeats',
                        'Encoder', 'Renderer', 'interpolate', 'spring', 'THEMES', 'HOUSE', 'VideoDoc']) {
      expect(mod, name).toHaveProperty(name);
    }
  });
});

describe('builder API', () => {
  test('produces the same document shape as YAML', () => {
    const doc = film('t').vertical().taste('bootdev').add(title('a')).toDoc();
    expect(doc.canvas.width).toBe(1080);
    expect(doc.canvas.height).toBe(1920);
    expect(doc.scenes[0]!.block).toBe('title');
  });

  test('orientation switches are exclusive', () => {
    expect(film('t').vertical().add(title('a')).toDoc().canvas.orientation).toBe('portrait');
    expect(film('t').horizontal().add(title('a')).toDoc().canvas.orientation).toBe('landscape');
    expect(film('t').square().add(title('a')).toDoc().canvas.orientation).toBe('square');
    expect(film('t').canvas(400, 400).add(title('a')).toDoc().canvas.width).toBe(400);
  });

  test('chaining sets every option it claims to', () => {
    const s = title('hello').kicker('k').sub('s').left().dur('8b').id('intro')
      .bg('grid', { opacity: 0.4 }).say('narration here').toScene() as any;
    expect(s).toMatchObject({ block: 'title', text: 'hello', kicker: 'k', sub: 's', align: 'left', dur: '8b', id: 'intro', say: 'narration here' });
    expect(s.bg).toMatchObject({ kind: 'grid', opacity: 0.4 });
  });

  test('terminal .run stacks commands in order', () => {
    const s = terminal().title('bash').run('a', 'out-a').run('b').out('trailing').toScene() as any;
    expect(s.lines).toHaveLength(3);
    expect(s.lines[0]).toMatchObject({ cmd: 'a', out: 'out-a', prompt: '$' });
    expect(s.lines[1]!.out).toBeUndefined();
    expect(s.lines[2]!.cmd).toBeUndefined();
  });

  test('every block has a builder and they all validate', () => {
    const scenes = [
      title('a'), statement('b'), code('go', 'x'), terminal().run('ls'),
      stat('1', 'x'), list('a', 'b'), chart([{ label: 'a', value: 1 }]),
      quote('q').by('someone'), compare({ title: 'L', items: ['1'] }, { title: 'R', items: ['2'] }),
      broll('waves'), outro('bye'),
    ];
    const doc = film('all').add(scenes).toDoc();
    expect(doc.scenes).toHaveLength(11);
    expect(new Set(doc.scenes.map((s) => s.block)).size).toBe(11);
  });

  test('add flattens arrays so ordinary code composes scenes', () => {
    const doc = film('t').add(
      title('head'),
      ['x', 'y', 'z'].map((w) => statement(w)),
      outro('end'),
    ).toDoc();
    expect(doc.scenes.map((s) => s.block)).toEqual(['title', 'statement', 'statement', 'statement', 'outro']);
  });

  test('invalid input is rejected at build time, not render time', () => {
    expect(() => (title('a') as any).dur('a while').toScene()).toThrow();
    expect(() => (title('a') as any).bg('lava').toScene()).toThrow();
    expect(() => film('t').toDoc()).toThrow();   // no scenes
  });

  test('code builder switches between inline and file sources', () => {
    const inline = code('go', 'package main').toScene() as any;
    expect(inline.code).toBe('package main');
    const fromFile = code('go', 'package main').from('./x.go').toScene() as any;
    expect(fromFile.file).toBe('./x.go');
    expect(fromFile.code).toBeUndefined();
  });

  test('a built film plans and renders like any other document', async () => {
    const doc = film('built').canvas(240, 426).fps(30).add(
      title('from code').kicker('api'),
      stat('42', 'answer'),
    ).toDoc();
    const { timeline } = plan(doc, THEMES.bootdev, grid);
    expect(timeline.cues).toHaveLength(2);
    const f = await Film.create({ doc, taste: THEMES.bootdev, grid });
    expect((await f.framePixels(10)).byteLength).toBe(240 * 426 * 4);
  }, 30000);
});
