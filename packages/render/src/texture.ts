import { rng } from '@stingo/core';

export interface TextureCfg { grain: number; scanlines: number; vignette: number }

/** Grain, vignette and scanlines are per-pixel effects. Expressed as SVG filters
 *  they cost 1.5s+ per frame (feTurbulence is a convolution); as a precomputed
 *  lookup applied to the RGBA buffer they cost a few milliseconds.
 *  Masks are built once and reused for every frame of the render. */
export class TexturePass {
  /** combined vignette+scanline multiplier, 0..256 (256 == unchanged) */
  private k?: Uint16Array;
  /** per-pixel grain offset, pre-scaled by cfg.grain */
  private g?: Int8Array;
  readonly enabled: boolean;

  constructor(readonly w: number, readonly h: number, cfg: TextureCfg, seed = 11) {
    this.enabled = cfg.grain > 0 || cfg.vignette > 0 || cfg.scanlines > 0;
    const n = w * h;

    if (cfg.vignette > 0 || cfg.scanlines > 0) {
      this.k = new Uint16Array(n);
      const cx = w / 2, cy = h * 0.45;
      const maxD = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy));
      for (let y = 0; y < h; y++) {
        const scanV = cfg.scanlines > 0 && y % 4 < 2 ? cfg.scanlines : 0;
        for (let x = 0; x < w; x++) {
          let dark = scanV;
          if (cfg.vignette > 0) {
            const d = Math.hypot(x - cx, y - cy) / maxD;
            const t = Math.max(0, (d - 0.45) / 0.55);
            dark += t * t * cfg.vignette;
          }
          this.k[y * w + x] = Math.max(0, Math.round((1 - Math.min(1, dark)) * 256));
        }
      }
    }
    if (cfg.grain > 0) {
      const r = rng(seed);
      this.g = new Int8Array(n);
      for (let i = 0; i < n; i++) this.g[i] = Math.round((r() * 2 - 1) * 127 * cfg.grain);
    }
  }

  /** Mutates the RGBA buffer in place. Tight loop: one multiply-shift and one
   *  add per channel, everything else precomputed at construction. */
  apply(px: Buffer): Buffer {
    if (!this.enabled) return px;
    const n = this.w * this.h;
    const k = this.k, g = this.g;
    if (k && g) {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const kk = k[p]!, gg = g[p]!;
        px[i] = c255(((px[i]! * kk) >> 8) + gg);
        px[i + 1] = c255(((px[i + 1]! * kk) >> 8) + gg);
        px[i + 2] = c255(((px[i + 2]! * kk) >> 8) + gg);
      }
    } else if (k) {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const kk = k[p]!;
        px[i] = (px[i]! * kk) >> 8;
        px[i + 1] = (px[i + 1]! * kk) >> 8;
        px[i + 2] = (px[i + 2]! * kk) >> 8;
      }
    } else if (g) {
      for (let p = 0, i = 0; p < n; p++, i += 4) {
        const gg = g[p]!;
        px[i] = c255(px[i]! + gg);
        px[i + 1] = c255(px[i + 1]! + gg);
        px[i + 2] = c255(px[i + 2]! + gg);
      }
    }
    return px;
  }
}

const c255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
