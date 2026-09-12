import { VideoDoc, Scene, Broll, Camera, CANVAS_PRESETS, type TasteProfile } from '@stingo/schema';

/** Code-first authoring. YAML is good for generated content; this is for when
 *  you want types, autocomplete, loops and real composition.
 *
 *      export default film('Concurrency in Go')
 *        .vertical().taste('bootdev').music('./track.mp3')
 *        .add(
 *          title('Your program is waiting').kicker('concurrency'),
 *          code('go', src).highlight(3, 4),
 *        );
 */

type TimeVal = number | string;
type BrollKind = Broll['kind'];
type AnimKind = 'fade'|'rise'|'fall'|'pop'|'slideL'|'slideR'|'wipe'|'typewriter'|'blur'|'none';
type CameraOpts = Partial<Omit<Camera, 'src'>>;

/** Shared scene options. Every block builder inherits these. */
class SceneBuilder<Self extends SceneBuilder<any>> {
  constructor(protected readonly s: Record<string, any>) {}
  private self() { return this as unknown as Self; }

  /** Fix the scene length: seconds (4 or '4s'), beats ('8b') or bars ('2bar'). */
  dur(v: TimeVal) { this.s.dur = v; return this.self(); }
  /** Pin an absolute start time instead of following the previous scene. */
  at(v: TimeVal) { this.s.at = v; return this.self(); }
  /** Name the scene, so timelines and warnings are readable. */
  id(v: string) { this.s.id = v; return this.self(); }
  /** Narration. Drives captions and, when dur is unset, the scene length. */
  say(v: string) { this.s.say = v; return this.self(); }
  note(v: string) { this.s.note = v; return this.self(); }

  /** Procedural background. `bg('grid')` or `bg('particles', { opacity: .8 })`. */
  bg(kind: BrollKind, opts: Partial<Omit<Broll, 'kind' | 'src'>> = {}) {
    this.s.bg = { kind, ...opts };
    return this.self();
  }

  /** Your own footage or image behind the scene.
   *
   *  `scrim` defaults high because stingo cannot see what is in your media and
   *  therefore cannot promise the type on top of it stays readable. Turn it
   *  down when you have checked a still. */
  backdrop(src: string, opts: Partial<Omit<Broll, 'kind' | 'src'>> = {}) {
    this.s.bg = { src, ...opts };
    return this.self();
  }
  /** Composite a recorded take into this scene.
   *
   *      code('go', src).camera('takes/02.mp4', { layout: 'pip', corner: 'br' })
   *
   *  Works on every block, not just `camera()`. */
  camera(src: string, opts: CameraOpts = {}) {
    this.s.camera = { src, ...opts };
    return this.self();
  }
  /** Override the taste's cut behaviour for this scene. */
  cut(mode: 'free' | 'beat' | 'bar') { this.s.cut = mode; return this.self(); }

  enter(kind: AnimKind, opts: { delay?: number; dur?: number; ease?: string } = {}) {
    this.s.enter = { kind, ...opts };
    return this.self();
  }
  exit(kind: AnimKind, opts: { delay?: number; dur?: number } = {}) {
    this.s.exit = { kind, ...opts };
    return this.self();
  }

  /** Validate and freeze into a plain scene object. */
  toScene(): Scene { return Scene.parse(this.s); }
}

class TitleBuilder extends SceneBuilder<TitleBuilder> {
  kicker(v: string) { this.s.kicker = v; return this; }
  sub(v: string) { this.s.sub = v; return this; }
  left() { this.s.align = 'left'; return this; }
  center() { this.s.align = 'center'; return this; }
}
class StatementBuilder extends SceneBuilder<StatementBuilder> {
  /** Words to colour with the accent. */
  emphasis(...words: string[]) { this.s.emphasis = words; return this; }
}
class CodeBuilder extends SceneBuilder<CodeBuilder> {
  /** 1-based line numbers to call out. */
  highlight(...lines: number[]) { this.s.highlight = lines; return this; }
  caption(v: string) { this.s.caption = v; return this; }
  /** Load the source from a file instead of inline. */
  from(file: string) { this.s.file = file; delete this.s.code; return this; }
  reveal(mode: 'all' | 'lines' | 'typewriter') { this.s.reveal = mode; return this; }
}
class TerminalBuilder extends SceneBuilder<TerminalBuilder> {
  title(v: string) { this.s.title = v; return this; }
  /** A typed command, optionally with its output. */
  run(cmd: string, out?: string, opts: { prompt?: string; delay?: number } = {}) {
    this.s.lines.push({ prompt: opts.prompt ?? '$', cmd, out, delay: opts.delay ?? 0 });
    return this;
  }
  /** Output with no command in front of it. */
  out(text: string) { this.s.lines.push({ prompt: '', out: text, delay: 0 }); return this; }
}
class StatBuilder extends SceneBuilder<StatBuilder> {
  sub(v: string) { this.s.sub = v; return this; }
}
class ListBuilder extends SceneBuilder<ListBuilder> {
  title(v: string) { this.s.title = v; return this; }
  marker(m: 'num' | 'dot' | 'arrow' | 'check') { this.s.marker = m; return this; }
}
class ChartBuilder extends SceneBuilder<ChartBuilder> {
  title(v: string) { this.s.title = v; return this; }
  unit(v: string) { this.s.unit = v; return this; }
  line() { this.s.kind = 'line'; return this; }
  bar() { this.s.kind = 'bar'; return this; }
  /** Pull one datum out with the accent colour. */
  highlight(index: number) { this.s.highlightIndex = index; return this; }
}
class QuoteBuilder extends SceneBuilder<QuoteBuilder> {
  by(v: string) { this.s.attrib = v; return this; }
}
class CompareBuilder extends SceneBuilder<CompareBuilder> {}
export interface DiagramNode {
  id: string; label: string; at: [number, number];
  kind?: 'box' | 'store' | 'queue' | 'actor' | 'ghost';
  span?: number; note?: string; accent?: boolean;
}
export interface DiagramEdge {
  from: string; to: string; label?: string;
  style?: 'solid' | 'dashed' | 'thick'; bend?: number; both?: boolean; accent?: boolean;
}

class DiagramBuilder extends SceneBuilder<DiagramBuilder> {
  title(v: string) { this.s.title = v; return this; }
  /** Add a node. Position is an explicit [column, row]. */
  node(id: string, label: string, at: [number, number], opts: Partial<Omit<DiagramNode, 'id' | 'label' | 'at'>> = {}) {
    this.s.nodes.push({ id, label, at, ...opts });
    return this;
  }
  /** Connect two nodes by id. */
  edge(from: string, to: string, opts: Partial<Omit<DiagramEdge, 'from' | 'to'>> = {}) {
    this.s.edges.push({ from, to, ...opts });
    return this;
  }
}

class ImageBuilder extends SceneBuilder<ImageBuilder> {
  caption(v: string) { this.s.caption = v; return this; }
  kicker(v: string) { this.s.kicker = v; return this; }
  /** Frame it like an app window, with a title bar. */
  window(title?: string) { this.s.frame = 'window'; if (title) this.s.title = title; return this; }
  plain() { this.s.frame = 'plain'; return this; }
  bare() { this.s.frame = 'none'; return this; }
  cover() { this.s.fit = 'cover'; return this; }
  contain() { this.s.fit = 'contain'; return this; }
  /** Slow push-in over the scene; 0 holds it still. */
  drift(v: number) { this.s.drift = v; return this; }
}

class BrollBuilder extends SceneBuilder<BrollBuilder> {
  caption(v: string) { this.s.caption = v; return this; }
}
class OutroBuilder extends SceneBuilder<OutroBuilder> {
  sub(v: string) { this.s.sub = v; return this; }
  handle(v: string) { this.s.handle = v; return this; }
}

export const title = (text: string) => new TitleBuilder({ block: 'title', text });
export const statement = (text: string) => new StatementBuilder({ block: 'statement', text });
export const code = (lang: string, src?: string) => new CodeBuilder({ block: 'code', lang, ...(src ? { code: src } : {}) });
export const terminal = () => new TerminalBuilder({ block: 'terminal', lines: [] });
export const stat = (value: string | number, label: string) => new StatBuilder({ block: 'stat', value: String(value), label });
export const list = (...items: string[]) => new ListBuilder({ block: 'list', items });
export const chart = (data: { label: string; value: number }[]) => new ChartBuilder({ block: 'chart', data });
export const quote = (text: string) => new QuoteBuilder({ block: 'quote', text });
export const compare = (
  left: { title: string; items: string[] },
  right: { title: string; items: string[] },
) => new CompareBuilder({ block: 'compare', left, right });
export const image = (src: string) => new ImageBuilder({ block: 'image', src });
export const diagram = (title?: string) =>
  new DiagramBuilder({ block: 'diagram', nodes: [], edges: [], ...(title ? { title } : {}) });
export const broll = (kind: BrollKind = 'particles') => new BrollBuilder({ block: 'broll', bg: { kind } });
export const outro = (text: string) => new OutroBuilder({ block: 'outro', text });
/** A scene that is a recorded take. `layout` defaults to filling the frame. */
export const camera = (src: string, opts: CameraOpts = {}) =>
  new CameraBuilder({ block: 'camera', camera: { src, ...opts } });

class CameraBuilder extends SceneBuilder<CameraBuilder> {
  /** A name card over the take. */
  lower(name: string, role?: string) { this.s.lower = { name, ...(role ? { role } : {}) }; return this; }
  caption(v: string) { this.s.caption = v; return this; }
  /** Reframe within the box without re-shooting. */
  frame(opts: { zoom?: number; offsetX?: number; offsetY?: number; mirror?: boolean }) {
    this.s.camera = { ...this.s.camera, ...opts };
    return this;
  }
  /** In-point within the take, so one recording can feed several scenes. */
  from(v: number | string) { this.s.camera = { ...this.s.camera, from: v }; return this; }
}

export type AnyScene = SceneBuilder<any> | Scene;
const toScene = (s: AnyScene): Scene => (s instanceof SceneBuilder ? s.toScene() : Scene.parse(s));

export class FilmBuilder {
  private doc: Record<string, any> = {
    title: 'untitled',
    canvas: { preset: 'vertical', fps: 30 },
    taste: 'bootdev',
    audio: {},
    captions: {},
    scenes: [],
  };
  constructor(name?: string) { if (name) this.doc.title = name; }

  vertical() { this.doc.canvas = { ...this.doc.canvas, preset: 'vertical', width: undefined, height: undefined }; return this; }
  horizontal() { this.doc.canvas = { ...this.doc.canvas, preset: 'horizontal', width: undefined, height: undefined }; return this; }
  square() { this.doc.canvas = { ...this.doc.canvas, preset: 'square', width: undefined, height: undefined }; return this; }
  canvas(width: number, height: number) { this.doc.canvas = { ...this.doc.canvas, width, height, preset: undefined }; return this; }
  fps(n: number) { this.doc.canvas.fps = n; return this; }

  /** A built-in name, a path to a taste file, or an inline profile. */
  taste(ref: string | TasteProfile) { this.doc.taste = ref; return this; }

  music(file: string, opts: { bpm?: number | 'auto'; gainDb?: number } = {}) {
    this.doc.audio.music = file;
    if (opts.bpm != null) this.doc.audio.bpm = opts.bpm;
    if (opts.gainDb != null) this.doc.audio.musicGainDb = opts.gainDb;
    return this;
  }
  voiceover(file: string) { this.doc.audio.vo = file; return this; }
  captions(opts: { style?: 'word' | 'line'; burn?: boolean } = {}) {
    this.doc.captions = { enabled: true, ...opts };
    return this;
  }

  /** Append scenes. Takes builders, plain objects, or arrays of either — so
   *  `.add(...items.map(i => statement(i)))` works. */
  add(...scenes: (AnyScene | AnyScene[])[]) {
    for (const s of scenes.flat()) this.doc.scenes.push(toScene(s));
    return this;
  }

  /** Validate into the same document shape the YAML path produces. */
  toDoc(): VideoDoc { return VideoDoc.parse(this.doc); }
  toJSON() { return this.toDoc(); }
}

export const film = (name?: string) => new FilmBuilder(name);

/** Marker for a default export so the CLI can recognise a film module. */
export const defineFilm = (f: FilmBuilder | VideoDoc) => f;
