import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { loadFonts, resolveFamily, type LoadedFont } from './fonts';
import type { El } from './h';

export interface RendererOpts { width: number; height: number; fontDir?: string; fonts?: LoadedFont[] }

/** resvg needs real font files for any <text> we hand-write into the SVG
 *  (b-roll glyphs). Satori-produced text is already glyph paths and needs none. */
export interface ResvgFontCfg { loadSystemFonts: boolean; fontFiles?: string[]; defaultFontFamily?: string }

export class Renderer {
  private constructor(readonly width: number, readonly height: number, readonly fonts: LoadedFont[], private fontCfg: ResvgFontCfg) {}

  static async create(opts: RendererOpts): Promise<Renderer> {
    const dir = opts.fontDir ?? 'assets/fonts';
    const fonts = opts.fonts ?? (await loadFonts(dir));
    const { readdir } = await import('node:fs/promises');
    const { join, resolve } = await import('node:path');
    const files = (await readdir(dir)).filter((f) => /\.(ttf|otf)$/i.test(f) && !/Inter\.ttf$/i.test(f))
      .map((f) => resolve(join(dir, f)));
    const fontCfg: ResvgFontCfg = { loadSystemFonts: false, fontFiles: files, defaultFontFamily: 'JetBrains Mono' };
    return new Renderer(opts.width, opts.height, fonts, fontCfg);
  }

  family(requested: string) { return resolveFamily(this.fonts, requested); }

  /** Element tree → SVG string. Also the preview path, so preview is exact. */
  async toSvg(el: El): Promise<string> {
    return satori(el as any, { width: this.width, height: this.height, fonts: this.fonts as any });
  }

  /** Element tree → raw RGBA pixels, ready to pipe to ffmpeg.
   *  loadSystemFonts:false is load-bearing: satori already embeds glyph paths,
   *  and scanning system fonts per frame costs ~500ms. */
  async toPixels(el: El): Promise<Buffer> {
    const svg = await this.toSvg(el);
    return new Resvg(svg, { fitTo: { mode: 'width', value: this.width }, font: this.fontCfg }).render().pixels;
  }

  async toPng(el: El): Promise<Buffer> {
    const svg = await this.toSvg(el);
    return new Resvg(svg, { fitTo: { mode: 'width', value: this.width }, font: this.fontCfg }).render().asPng();
  }

  svgToPng(svg: string): Buffer {
    return new Resvg(svg, { fitTo: { mode: 'width', value: this.width }, font: this.fontCfg }).render().asPng();
  }

  /** Rasterize an SVG string that was produced elsewhere (e.g. cached). */
  svgToPixels(svg: string): Buffer {
    return new Resvg(svg, { fitTo: { mode: 'width', value: this.width }, font: this.fontCfg }).render().pixels;
  }
}
