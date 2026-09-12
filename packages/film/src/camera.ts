import { SourcePool, blendUnder, flattenOnto, type Framing } from '@stingo/media';
import type { Camera } from '@stingo/schema';
import type { Placement } from '@stingo/blocks';

export interface CameraCut {
  cam: Camera;
  placement: Placement;
  /** seconds into the take for the frame being rendered */
  srcTime: number;
}

/** Rounded and circular framing need soft edges. The mask is per placement
 *  size and cached, exactly like the texture pass — computing coverage per
 *  frame would cost more than the decode. */
function coverageMask(p: Placement): Uint8Array | undefined {
  if (p.shape === 'square' || p.rx <= 0) return undefined;
  const { w, h, rx } = p;
  const m = new Uint8Array(w * h);
  const r = Math.min(rx, Math.min(w, h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // distance outside the rounded-rect's inner box, i.e. into a corner
      const dx = Math.max(r - x - 0.5, x + 0.5 - (w - r), 0);
      const dy = Math.max(r - y - 0.5, y + 0.5 - (h - r), 0);
      const d = dx === 0 || dy === 0 ? Math.max(dx, dy) : Math.hypot(dx, dy);
      // one pixel of feather along the edge keeps the curve from stair-stepping
      const cov = d <= r - 0.5 ? 1 : d >= r + 0.5 ? 0 : r + 0.5 - d;
      m[y * w + x] = Math.round(Math.max(0, Math.min(1, cov)) * 255);
    }
  }
  return m;
}

/** Decodes takes and composites them under the rasterised frame.
 *  One per Film, so one per render worker — each worker sweeps a contiguous
 *  frame range and therefore keeps every decoder on its sequential fast path. */
export class CameraPass {
  private pool: SourcePool;
  private masks = new Map<string, Uint8Array | undefined>();
  /** sources already reported as unopenable, so the warning is printed once */
  private broken = new Set<string>();
  /** flat colour for any pixel neither the SVG nor the take covered */
  constructor(private bg: [number, number, number], fps: number, private enabled = true) {
    this.pool = new SourcePool(fps);
  }

  private maskFor(p: Placement): Uint8Array | undefined {
    const key = `${p.shape}:${p.w}x${p.h}:${Math.round(p.rx)}`;
    if (!this.masks.has(key)) this.masks.set(key, coverageMask(p));
    return this.masks.get(key);
  }

  /** Blend the take into `px` (mutated in place) and leave the frame opaque. */
  async apply(px: Buffer, w: number, h: number, cut: CameraCut | null, flatten = true): Promise<Buffer> {
    if (cut && this.enabled) {
      const { cam, placement: p } = cut;
      const framing: Framing = {
        fit: cam.fit, zoom: cam.zoom, offsetX: cam.offsetX, offsetY: cam.offsetY, mirror: cam.mirror,
      };
      // Belt and braces: compose already skips a source that could not be
      // probed, but a file can also vanish between probing and rendering, and
      // one unreadable take must not kill a worker a thousand frames in.
      let src;
      try {
        src = await this.pool.get(cam.src);
      } catch (e) {
        if (!this.broken.has(cam.src)) {
          this.broken.add(cam.src);
          console.error(`[camera] ${cam.src} could not be opened, leaving its box empty: `
            + `${e instanceof Error ? e.message : e}`);
        }
        return flattenOnto(px, w * h, this.bg);
      }
      const layer = await src.at(cut.srcTime, { w: p.w, h: p.h }, framing);
      blendUnder(px, w, h, layer, p.w, p.h, p.x, p.y, this.maskFor(p));
    }
    // The mask leaves holes wherever nothing covered them; the encoder wants
    // opaque frames, so anything still transparent takes the background colour.
    // Deferred when a backdrop is still to be blended underneath — flattening
    // first would fill the very holes the backdrop is meant to show through.
    if (cut && flatten) flattenOnto(px, w * h, this.bg);
    return px;
  }

  async close(): Promise<void> { await this.pool.close(); }
}

export const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
