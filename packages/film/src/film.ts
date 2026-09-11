import { Renderer, composite, box, TexturePass, type El } from '@stingo/render';
import { makeStage, substage, renderBlock, textureLayer, gridLayer, progressBar, sceneChip, renderBroll, brollDefs, initHighlighter,
  cameraPlacement, cameraMask, cameraChrome, contentRect, type BlockCtx, type Placement } from '@stingo/blocks';
import { Timeline, clamp, interpolate, toSeconds, type BeatGrid, DEFAULT_GRID } from '@stingo/core';
import { Broll, type VideoDoc, type TasteProfile, type Scene } from '@stingo/schema';
import { plan, type ClipTable } from './plan';
import { rgbaToPng } from './png';
import { CameraPass, hexRgb, type CameraCut } from './camera';

interface Composition {
  el: El;
  defs: string;
  behind: string;
  infront: string;
  mask?: { id: string; body: boolean };
  cut: CameraCut | null;
}

export interface FilmOpts {
  doc: VideoDoc;
  taste: TasteProfile;
  grid?: BeatGrid;
  fontDir?: string;
  /** draw the progress bar + scene counter */
  hud?: boolean;
  /** skip decoding camera takes and draw a placeholder instead — the fast path
   *  while iterating on a script whose footage is not shot yet */
  noCamera?: boolean;
  /** measured take lengths, from probeClips — lets a talking-head scene take
   *  its length from the footage */
  clips?: ClipTable;
}

/** A Film is a pure function of frame index. Nothing is stateful across frames,
 *  so any frame can be rendered on any worker in any order. */
export class Film {
  private constructor(
    readonly doc: VideoDoc,
    readonly taste: TasteProfile,
    readonly timeline: Timeline,
    readonly renderer: Renderer,
    readonly grid: BeatGrid,
    readonly warnings: string[],
    private hud: boolean,
    private texture: TexturePass,
    private camera: CameraPass,
    readonly noCamera: boolean,
  ) {}

  static async create(opts: FilmOpts): Promise<Film> {
    const grid = opts.grid ?? DEFAULT_GRID;
    const { timeline, warnings } = plan(opts.doc, opts.taste, grid, opts.clips);
    const { width, height } = opts.doc.canvas;
    const renderer = await Renderer.create({ width, height, fontDir: opts.fontDir });
    if (opts.doc.scenes.some((s) => s.block === 'code')) await initHighlighter();
    const texture = new TexturePass(width, height, opts.taste.texture);
    const noCamera = opts.noCamera ?? false;
    const camera = new CameraPass(hexRgb(opts.taste.palette.bg), opts.doc.canvas.fps, !noCamera);
    return new Film(opts.doc, opts.taste, timeline, renderer, grid, warnings, opts.hud ?? true, texture, camera, noCamera);
  }

  get fps() { return this.doc.canvas.fps; }
  get frameCount() { return this.timeline.frameCount; }
  get duration() { return this.timeline.duration; }

  /** Default b-roll per block type, so a scene never sits on flat colour. */
  private brollFor(scene: Scene, index: number): Broll {
    if (scene.bg) return Broll.parse(scene.bg);
    const byBlock: Partial<Record<Scene['block'], Partial<Broll>>> = {
      title: { kind: 'beams', opacity: 0.55 },
      statement: { kind: 'mesh', opacity: 0.5 },
      code: { kind: 'grid', opacity: 0.32 },
      terminal: { kind: 'codeRain', opacity: 0.22 },
      stat: { kind: 'pulse', opacity: 0.5 },
      chart: { kind: 'grid', opacity: 0.3 },
      list: { kind: 'dots', opacity: 0.35 },
      quote: { kind: 'mesh', opacity: 0.4 },
      compare: { kind: 'grid', opacity: 0.28 },
      outro: { kind: 'particles', opacity: 0.6 },
      broll: { kind: 'particles', opacity: 0.8 },
    };
    return Broll.parse({ seed: index * 17 + 3, ...(byBlock[scene.block] ?? { kind: 'grid', opacity: 0.3 }) });
  }

  /** Build the element tree + SVG layers for absolute time t.
   *
   *  When a scene carries a camera take, the take is not drawn here — it is
   *  pixels, and gets blended under the rasterised frame afterwards. What this
   *  does instead is cut a hole for it and decide what the hole cuts through,
   *  which is what sets the take's z-order:
   *
   *    full   the take is the backdrop — mask the background, keep the block
   *           content above it, so captions and lower thirds stay readable
   *    pip    the inset sits over the block content — mask both
   *    split  the two never overlap — mask the background only
   */
  private compose(t: number, forPixels: boolean): Composition {
    const hit = this.timeline.at(t);
    if (!hit) throw new Error(`no scene at t=${t}`);
    const scene = this.doc.scenes[hit.cue.index]!;
    const { width, height } = this.doc.canvas;
    const stage = makeStage(width, height, this.taste);
    const cam = scene.camera;

    // a split scene hands the block a smaller stage and offsets it into place
    const rect = cam ? contentRect(cam, stage) : null;
    const ctx: BlockCtx = {
      t: hit.local, dur: hit.cue.dur, abs: t, stage: rect ? substage(stage, rect.w, rect.h) : stage,
      taste: this.taste, grid: this.grid, family: (n) => this.renderer.family(n), index: hit.cue.index,
    };

    const cfg = this.brollFor(scene, hit.cue.index);
    const bg = renderBroll(hit.local, { w: width, h: height, palette: this.taste.palette, cfg, dur: hit.cue.dur });
    const tex = textureLayer(ctx);

    // scene-boundary dip: brief darkening across the cut reads as an intentional edit
    const trans = this.taste.transition;
    let dip = '';
    if (trans.kind === 'fade' && trans.duration > 0) {
      const inP = interpolate(hit.local, [0, trans.duration], [1, 0]);
      const outP = interpolate(hit.local, [hit.cue.dur - trans.duration, hit.cue.dur], [0, 1]);
      // element-level enter/exit already carries the cut; the frame dip is a
      // seasoning on top, so keep it well short of a blackout
      const amt = clamp(Math.max(inP, hit.cue.index === this.timeline.cues.length - 1 ? 0 : outP)) * 0.42;
      if (amt > 0.002) dip = `<rect width="${width}" height="${height}" fill="${this.taste.palette.bg}" opacity="${amt.toFixed(3)}"/>`;
    }

    let content = renderBlock(scene, ctx);
    if (rect) {
      content = box({ width, height, position: 'relative' },
        box({ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }, content));
    }

    const el = this.hud
      ? box({ width, height, position: 'relative' },
          content,
          sceneChip(hit.cue.index, this.timeline.cues.length, ctx),
          progressBar(t, this.timeline.duration, ctx))
      : content;

    // the grid b-roll already draws a grid; drawing the chrome one too doubles
    // the line count for no visual gain
    let behind = `<rect width="${width}" height="${height}" fill="${this.taste.palette.bg}"/>`
      + (cfg.kind === 'grid' ? '' : gridLayer(ctx)) + bg;
    let defs = brollDefs(this.taste.palette, width, height) + tex.defs;
    let infront = tex.infront + dip;
    let cut: CameraCut | null = null;
    let mask: { id: string; body: boolean } | undefined;

    if (cam) {
      const placement = cameraPlacement(cam, stage, this.taste);
      const srcTime = toSeconds(cam.from, this.grid) + hit.local;
      // an SVG-only consumer (the preview server) has no pixel stage to blend
      // into, so it gets a labelled placeholder where the take would sit
      if (forPixels && !this.noCamera) {
        mask = { id: 'stingo-cam', body: cam.layout === 'pip' };
        defs += cameraMask(placement, width, height, mask.id);
        cut = { cam, placement, srcTime };
      } else {
        behind += placeholderPanel(placement, this.taste, srcTime);
      }
      infront += cameraChrome(placement, cam, ctx);
    }

    return { el, defs, behind, infront, mask, cut };
  }

  /** SVG for one frame. Camera takes appear as placeholders: an SVG document
   *  cannot carry decoded video, and this is the preview path. */
  async frameSvg(frame: number): Promise<string> {
    const t = frame / this.fps;
    const { el, defs, behind, infront } = this.compose(t, false);
    return composite(await this.renderer.toSvg(el), { defs, behind, infront });
  }

  /** Raw RGBA pixels for one frame — the encoder's input. */
  async framePixels(frame: number): Promise<Buffer> {
    const t = frame / this.fps;
    const { el, defs, behind, infront, mask, cut } = this.compose(t, true);
    const svg = composite(await this.renderer.toSvg(el), { defs, behind, infront, mask });
    const px = await this.camera.apply(this.renderer.svgToPixels(svg), this.doc.canvas.width, this.doc.canvas.height, cut);
    return this.texture.apply(px);
  }

  /** Release decoder processes. Safe to call more than once. */
  async close(): Promise<void> { await this.camera.close(); }

  /** PNG for previews/stills. Goes through the pixel path so textures apply. */
  async framePng(frame: number): Promise<Buffer> {
    const px = await this.framePixels(frame);
    const { width, height } = this.doc.canvas;
    return rgbaToPng(px, width, height);
  }
}

/** What the preview shows in place of a take: the box, its layout, and the
 *  timecode being read from the source, so a script can be cut before a single
 *  frame has been shot. */
function placeholderPanel(p: Placement, taste: TasteProfile, srcTime: number): string {
  const { palette } = taste;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  const r = Math.min(p.w, p.h) * 0.13;
  const mm = String(Math.floor(srcTime / 60)).padStart(2, '0');
  const ss = (srcTime % 60).toFixed(1).padStart(4, '0');
  const size = Math.max(12, Math.min(p.w, p.h) * 0.055);
  return `<g>`
    + `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" ry="${p.rx}" fill="${palette.surface}"/>`
    + `<circle cx="${cx}" cy="${cy - r * 0.5}" r="${r}" fill="none" stroke="${palette.border}" stroke-width="${Math.max(2, r * 0.13)}"/>`
    + `<path d="M ${cx - r * 1.7} ${cy + r * 1.9} a ${r * 1.7} ${r * 1.5} 0 0 1 ${r * 3.4} 0" fill="none" stroke="${palette.border}" stroke-width="${Math.max(2, r * 0.13)}"/>`
    + `<text x="${cx}" y="${p.y + p.h - size * 1.4}" fill="${palette.muted}" font-family="JetBrains Mono" font-size="${size}" text-anchor="middle">camera · ${mm}:${ss}</text>`
    + `</g>`;
}
