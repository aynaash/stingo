import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFonts, resolveFamily, type LoadedFont } from './fonts';
import { metricsFor, type FontMetrics } from './measure';
import type { El } from './h';

export interface RendererOpts { width: number; height: number; fontDir?: string; fonts?: LoadedFont[] }

/** resvg needs real font files for any <text> we hand-write into the SVG
 *  (b-roll glyphs). Satori-produced text is already glyph paths and needs none. */
export interface ResvgFontCfg { loadSystemFonts: boolean; fontFiles?: string[]; defaultFontFamily?: string }

/** Where the fonts live.
 *
 *  This used to be the bare relative string 'assets/fonts', which resolves
 *  against the *working directory* — fine inside this repository and broken
 *  everywhere else, because an installed package has no idea what directory
 *  someone happens to be standing in.
 *
 *  Fonts ship with the package, so resolve them relative to this module first
 *  and fall back to the repository layout. STINGO_FONTS overrides everything,
 *  which is also how you use your own typefaces without forking. */
export function defaultFontDir(): string {
  const env = process.env.STINGO_FONTS;
  if (env) return resolve(env);

  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../assets/fonts'),         // bundled: <pkg>/dist/index.js
    resolve(here, '../../assets/fonts'),      // published source layout
    resolve(here, '../../../assets/fonts'),   // repo: packages/render/src
    resolve(here, '../../../../assets/fonts'),
    resolve('assets/fonts'),                  // the working directory, as before
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error(
    'no font directory found. stingo ships fonts with the package; set STINGO_FONTS '
    + `to a directory of .ttf/.otf files, or pass fontDir. Looked in:\n  ${candidates.join('\n  ')}`,
  );
}

export class Renderer {
  private constructor(readonly width: number, readonly height: number, readonly fonts: LoadedFont[], private fontCfg: ResvgFontCfg) {}

  static async create(opts: RendererOpts): Promise<Renderer> {
    const dir = opts.fontDir ?? defaultFontDir();
    const fonts = opts.fonts ?? (await loadFonts(dir));
    const { readdir } = await import('node:fs/promises');
    const { join, resolve } = await import('node:path');
    const files = (await readdir(dir)).filter((f) => /\.(ttf|otf)$/i.test(f) && !/Inter\.ttf$/i.test(f))
      .map((f) => resolve(join(dir, f)));
    const fontCfg: ResvgFontCfg = { loadSystemFonts: false, fontFiles: files, defaultFontFamily: 'JetBrains Mono' };
    return new Renderer(opts.width, opts.height, fonts, fontCfg);
  }

  family(requested: string) { return resolveFamily(this.fonts, requested); }

  /** Glyph metrics for a family, so text can be measured before it is drawn.
   *  Weight matters: a bold face is wider, and fitting against the regular one
   *  would let headlines overflow at exactly the sizes that matter most. */
  metrics(requested: string, weight = 400): FontMetrics {
    const family = resolveFamily(this.fonts, requested);
    const exact = this.fonts.find((f) => f.name === family && f.weight === weight);
    const nearest = exact ?? this.fonts
      .filter((f) => f.name === family)
      .sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0];
    return metricsFor((nearest ?? this.fonts[0]!).data);
  }

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

  /** Rasterize at a width other than the canvas — for documents *about* a film
   *  rather than frames of one, like a contact sheet. */
  svgToPngAt(svg: string, width: number): Buffer {
    return new Resvg(svg, { fitTo: { mode: 'width', value: Math.round(width) }, font: this.fontCfg }).render().asPng();
  }

  /** Rasterize an SVG string that was produced elsewhere (e.g. cached). */
  svgToPixels(svg: string): Buffer {
    return new Resvg(svg, { fitTo: { mode: 'width', value: this.width }, font: this.fontCfg }).render().pixels;
  }
}
