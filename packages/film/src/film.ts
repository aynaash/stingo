import { Renderer, composite, box, TexturePass, fitText, layoutTokens, measureLine, type El } from '@stingo/render';
import { makeStage, T, substage, renderBlock, textureLayer, gridLayer, progressBar, sceneChip, renderBroll, brollDefs, initHighlighter,
  cameraPlacement, cameraMask, cameraChrome, contentRect,
  compositionRect, groundDefs, groundLayer, furnitureLayer, captionLayer, type BlockCtx, type Placement } from '@stingo/blocks';
import { Timeline, clamp, interpolate, toSeconds, type BeatGrid, DEFAULT_GRID } from '@stingo/core';
import { Broll, blockBroll, type VideoDoc, type TasteProfile, type Scene } from '@stingo/schema';
import { plan, type ClipTable } from './plan';
import { captionCues, captionAt, type CaptionCue } from './captions';
import { transitionFrame, type TransitionKind } from './transition';
import { BackdropPass, backdropFraming, backdropTime } from './backdrop';
import { rgbaToPng } from './png';
import { CameraPass, hexRgb, type CameraCut } from './camera';
import { flattenOnto } from '@stingo/media';

interface Composition {
  el: El;
  defs: string;
  behind: string;
  infront: string;
  mask?: { id: string; body: boolean };
  cut: CameraCut | null;
  /** a transition effect SVG cannot express, applied after rasterising */
  pixel?: (px: Buffer, w: number, h: number) => void;
  /** the scene's own media playing behind it, resolved after rasterising
   *  because measuring a clip's length is async and composing is not */
  backdrop?: { cfg: Broll; local: number } | null;
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
    readonly captions: CaptionCue[] | null,
    private camera: CameraPass,
    private backdrop: BackdropPass,
    readonly noCamera: boolean,
    /** sources probeClips could read; undefined means nothing was probed */
    private readable?: Set<string>,
  ) {}

  static async create(opts: FilmOpts): Promise<Film> {
    const grid = opts.grid ?? DEFAULT_GRID;
    const { timeline, warnings } = plan(opts.doc, opts.taste, grid, opts.clips);
    const { width, height } = opts.doc.canvas;
    const renderer = await Renderer.create({ width, height, fontDir: opts.fontDir });
    if (opts.doc.scenes.some((s) => s.block === 'code')) await initHighlighter();
    const texture = new TexturePass(width, height, opts.taste.texture);
    warnings.push(...fitWarnings(opts.doc, opts.taste, renderer));
    // the schema has advertised a captions field since v0.1; this is it reading
    const wantCaptions = opts.doc.captions?.enabled && (opts.doc.captions?.burn ?? true);
    const captions = wantCaptions ? captionCues(opts.doc, timeline, opts.taste) : null;
    const noCamera = opts.noCamera ?? false;
    const camera = new CameraPass(hexRgb(opts.taste.palette.bg), opts.doc.canvas.fps, !noCamera);
    const backdrop = new BackdropPass(opts.doc.canvas.fps, !noCamera);
    return new Film(opts.doc, opts.taste, timeline, renderer, grid, warnings, opts.hud ?? true,
      texture, captions, camera, backdrop, noCamera,
      opts.clips ? new Set(opts.clips.keys()) : undefined);
  }

  get fps() { return this.doc.canvas.fps; }
  get frameCount() { return this.timeline.frameCount; }
  get duration() { return this.timeline.duration; }

  /** Default b-roll for a scene. The preference comes from the block's own
   *  registration, so a new block arrives with a background already chosen. */
  private brollFor(scene: Scene, index: number): Broll {
    if (scene.bg) return Broll.parse(scene.bg);
    return Broll.parse({ seed: index * 17 + 3, ...blockBroll(scene.block) });
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

    // A split camera already reserves space, so composition stands aside for it.
    // Otherwise text-forward blocks are anchored off-centre — see artdirect.
    const rect = (cam ? contentRect(cam, stage) : null)
      ?? (scene.plain ? null : compositionRect(scene.block, stage));
    const ctx: BlockCtx = {
      t: hit.local, dur: hit.cue.dur, abs: t, stage: rect ? substage(stage, rect.w, rect.h) : stage,
      taste: this.taste, grid: this.grid, family: (n) => this.renderer.family(n), index: hit.cue.index,
      tokens: (txt, kind, size, maxWidth) => {
        const spec = this.taste.type[kind];
        return layoutTokens(txt, this.renderer.metrics(spec.family, spec.weight),
          { size, tracking: spec.tracking }, maxWidth);
      },
      // measureLine on a single space gives the advance; the tracking on either
      // side of it is what a measured line pays and a flexbox gap does not
      space: (kind, size) => {
        const spec = this.taste.type[kind];
        const adv = measureLine(' ', this.renderer.metrics(spec.family, spec.weight), { size, tracking: 0 });
        return Math.max(size * 0.12, adv + 2 * spec.tracking * size);
      },
      fit: (txt, kind, size, o) => {
        const spec = this.taste.type[kind];
        return fitText(txt, this.renderer.metrics(spec.family, spec.weight), size, {
          lineHeight: spec.lineHeight, tracking: spec.tracking, ...o,
        });
      },
    };
    // the art direction draws in canvas coordinates, so it needs the full stage
    // even when the block was handed a smaller one
    const full: BlockCtx = rect ? { ...ctx, stage } : ctx;

    const cfg = this.brollFor(scene, hit.cue.index);
    const bg = renderBroll(hit.local, { w: width, h: height, palette: this.taste.palette, cfg, dur: hit.cue.dur });
    const tex = textureLayer(ctx);

    const trans = this.taste.transition;
    const move = transitionFrame({
      kind: trans.kind as TransitionKind,
      local: hit.local,
      sceneDur: hit.cue.dur,
      duration: trans.duration,
      isFirst: hit.cue.index === 0,
      isLast: hit.cue.index === this.timeline.cues.length - 1,
      index: hit.cue.index,
      w: width, h: height,
      palette: this.taste.palette,
    });

    let content = renderBlock(scene, ctx);
    if (rect) {
      content = box({ width, height, position: 'relative' },
        box({ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }, content));
    }

    // A transition moves the whole composed scene, so it wraps everything —
    // including the composition rect. Applied inside that rect instead, the
    // scene slides within its own panel and the move is invisible.
    if (move.transform || move.opacity != null) {
      content = box({
        width, height,
        ...(move.transform ? { transform: move.transform } : {}),
        ...(move.opacity != null ? { opacity: move.opacity } : {}),
      }, content);
    }

    // Overlays are appended to the OUTER, full-frame box, but `ctx.stage` is the
    // block's composition rect — a smaller, offset box. Positioning an overlay
    // against a substage puts it wherever that rect happens to be, which is how
    // captions ended up halfway up the frame. Frame furniture gets frame
    // coordinates.
    const frameCtx: BlockCtx = { ...ctx, stage };

    // captions sit above the block and below the HUD, so they never cover the
    // progress bar and are never covered by scene content
    const caption = this.captions ? captionAt(this.captions, t) : null;
    const captionEl = caption
      ? captionLayer(
          {
            words: caption.cue.words,
            activeIndex: caption.wordIndex,
            style: this.doc.captions?.style ?? 'word',
            age: t - caption.cue.start,
          },
          frameCtx,
        )
      : null;

    const overlays = [captionEl,
      ...(this.hud
        ? [sceneChip(hit.cue.index, this.timeline.cues.length, frameCtx),
           progressBar(t, this.timeline.duration, frameCtx)]
        : [])].filter(Boolean);

    const el = overlays.length
      ? box({ width, height, position: 'relative' }, content, ...(overlays as El[]))
      : content;

    // the grid b-roll already draws a grid; drawing the chrome one too doubles
    // the line count for no visual gain
    // ground first, then b-roll, then the furniture that frames them
    // With the user's own media behind the scene the SVG must NOT paint a
    // ground, or the backdrop is blended under an opaque rectangle and never
    // seen. The scrim goes down instead: above the media, below the furniture
    // and the type, which is the only thing keeping text readable over footage
    // stingo has no say over.
    const media = cfg.src ? cfg : null;
    let behind = media
      ? (media.scrim > 0
          ? `<rect width="${width}" height="${height}" fill="${this.taste.palette.bg}" opacity="${media.scrim.toFixed(3)}"/>`
          : '')
        + furnitureLayer(full, rect)
      : `<rect width="${width}" height="${height}" fill="${this.taste.palette.bg}"/>`
        + groundLayer(full)
        + (cfg.kind === 'grid' ? '' : gridLayer(ctx)) + bg
        + (scene.plain ? '' : furnitureLayer(full, rect));
    let defs = brollDefs(this.taste.palette, width, height) + tex.defs
      + groundDefs(full, hit.cue.index);
    let infront = tex.infront + (move.overlay ?? '');
    let cut: CameraCut | null = null;
    let mask: { id: string; body: boolean } | undefined;

    if (cam) {
      const placement = cameraPlacement(cam, stage, this.taste);
      const srcTime = toSeconds(cam.from, this.grid) + hit.local;
      // an SVG-only consumer (the preview server) has no pixel stage to blend
      // into, so it gets a labelled placeholder where the take would sit
      // A take that could not be probed is not going to decode either. The CLI
      // already says it will draw a placeholder for one; without this it said so
      // and then the worker died on the first frame of that scene.
      const decodable = !this.readable || this.readable.has(cam.src);
      if (forPixels && !this.noCamera && decodable) {
        mask = { id: 'stingo-cam', body: cam.layout === 'pip' };
        defs += cameraMask(placement, width, height, mask.id);
        cut = { cam, placement, srcTime };
      } else {
        behind += placeholderPanel(placement, this.taste, srcTime);
      }
      infront += cameraChrome(placement, cam, ctx);
    }

    return { el, defs, behind, infront, mask, cut, pixel: move.pixel,
             backdrop: media ? { cfg: media, local: hit.local } : null };
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
    const { el, defs, behind, infront, mask, cut, pixel, backdrop } = this.compose(t, true);
    const svg = composite(await this.renderer.toSvg(el), { defs, behind, infront, mask });
    const { width, height } = this.doc.canvas;
    // blendUnder puts each layer beneath what is already there, so these run
    // top-down: the take goes under the type, the backdrop under the take.
    const px = await this.camera.apply(this.renderer.svgToPixels(svg), width, height, cut, !backdrop);
    if (backdrop) {
      const len = await this.backdrop.lengthOf(backdrop.cfg.src!);
      await this.backdrop.apply(px, width, height, {
        src: backdrop.cfg.src!,
        framing: backdropFraming(backdrop.cfg),
        srcTime: backdropTime(backdrop.cfg, backdrop.local, this.grid, len),
      });
      // nothing else will cover the holes now
      flattenOnto(px, width * height, hexRgb(this.taste.palette.bg));
    }
    // the glitch transition tears the finished frame, so it runs after the take
    // is composited but before the film grain settles over everything
    pixel?.(px, width, height);
    return this.texture.apply(px);
  }

  /** Release decoder processes. Safe to call more than once. */
  async close(): Promise<void> { await this.camera.close(); await this.backdrop.close(); }

  /** PNG for previews/stills. Goes through the pixel path so textures apply. */
  async framePng(frame: number): Promise<Buffer> {
    const px = await this.framePixels(frame);
    const { width, height } = this.doc.canvas;
    return rgbaToPng(px, width, height);
  }

  /** A frame with an SVG fragment composited on top, at canvas scale.
   *
   *  Overlays are for looking at, never for shipping: the encoder goes through
   *  framePixels and never sees this. It is how `still --guides` draws safe
   *  areas over a real frame instead of next to one. */
  async framePngOverlaid(frame: number, overlay: string): Promise<Buffer> {
    const png = await this.framePng(frame);
    const { width, height } = this.doc.canvas;
    return this.renderer.svgToPng(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`
      + ` width="${width}" height="${height}">`
      + `<image x="0" y="0" width="${width}" height="${height}"`
      + ` xlink:href="data:image/png;base64,${png.toString('base64')}"/>`
      + overlay + `</svg>`,
    );
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

/** Warn about scenes whose text cannot be made to fit.
 *
 *  Blocks shrink type to the frame, but there is a floor: past it the tool
 *  would be pretending it had solved a scene that simply has too many words in
 *  it. Rather than render something unreadable and say nothing, the scene is
 *  named here and the author decides what to cut.
 *
 *  Checked once per render, not per frame — the text does not change. */
export function fitWarnings(doc: VideoDoc, taste: TasteProfile, renderer: Renderer): string[] {
  const stage = makeStage(doc.canvas.width, doc.canvas.height, taste);
  const out: string[] = [];

  const check = (
    label: string, value: unknown,
    kind: 'display' | 'body' | 'mono', size: number,
    opts: { maxWidth?: number; maxHeight?: number; wrap?: boolean; floor?: number } = {},
  ) => {
    if (typeof value !== 'string' || !value.trim()) return;
    const spec = taste.type[kind];
    const r = fitText(value, renderer.metrics(spec.family, spec.weight), size, {
      maxWidth: opts.maxWidth ?? stage.contentW,
      maxHeight: opts.maxHeight,
      lineHeight: spec.lineHeight, tracking: spec.tracking,
      wrap: opts.wrap, floor: opts.floor,
    });
    if (r.overflows) out.push(`${label} does not fit the frame even at the smallest size — shorten it`);
  };

  doc.scenes.forEach((scene: any, i) => {
    const at = `scene ${i} ("${scene.id ?? scene.block}")`;
    const body = stage.h - stage.padY * 2;
    switch (scene.block) {
      case 'title':
        check(`${at} title`, scene.text, 'display', T.display(stage),
          { maxHeight: body - (scene.kicker ? stage.unit * 2.2 : 0) - (scene.sub ? stage.unit * 3.4 : 0) });
        break;
      case 'statement':
        check(`${at} statement`, scene.text, 'display', T.title(stage), { maxHeight: body });
        break;
      case 'quote':
        check(`${at} quote`, scene.text, 'body', T.heading(stage),
          { maxWidth: stage.contentW - stage.unit * 1.6, maxHeight: body - (scene.attrib ? stage.unit * 2.4 : 0) });
        break;
      case 'stat':
        check(`${at} value`, scene.value, 'display', T.huge(stage), { wrap: false, floor: 0.3 });
        check(`${at} label`, scene.label, 'display', T.heading(stage), { maxHeight: stage.unit * 3.2 });
        break;
      case 'outro':
        check(`${at} outro`, scene.text, 'display', T.title(stage), { maxHeight: body * 0.6 });
        break;
    }
  });
  return out;
}

/** Text-fit warnings without building a whole Film — for `plan`, which is
 *  meant to surface problems before a render is worth starting. */
export async function checkTextFits(
  doc: VideoDoc, taste: TasteProfile, fontDir?: string,
): Promise<string[]> {
  const renderer = await Renderer.create({ width: doc.canvas.width, height: doc.canvas.height, fontDir });
  return fitWarnings(doc, taste, renderer);
}
