import { SourcePool, blendUnder, type Framing } from '@stingo/media';
import { toSeconds, type BeatGrid } from '@stingo/core';
import type { Broll } from '@stingo/schema';

/** Your own media, playing behind a scene.
 *
 *  A backdrop is composited into the rasterised frame rather than embedded in
 *  the SVG. That is not a preference: resvg resamples a bitmap into the canvas
 *  on every frame, which costs ~350ms against ~33ms for type, and a backdrop is
 *  full-frame on every frame of the scene. Decoding once and blending is the
 *  difference between a usable feature and an unusable one.
 *
 *  Stills and clips share this path. A picture is a one-frame clip that holds,
 *  which is what a backdrop wants anyway. */

export interface Backdrop {
  src: string;
  framing: Framing;
  /** seconds into the source for this frame */
  srcTime: number;
}

/** Where in the source this frame comes from, looping or holding as asked. */
export function backdropTime(cfg: Broll, local: number, grid: BeatGrid, clipLength?: number): number {
  const from = toSeconds(cfg.from, grid, 0);
  if (!cfg.loop || !clipLength || clipLength <= 0.1) return from + local;
  // loop the portion after the in-point, so `from` is respected on every pass
  const span = Math.max(0.1, clipLength - from);
  return from + (local % span);
}

export function backdropFraming(cfg: Broll): Framing {
  return {
    fit: cfg.fit, zoom: cfg.zoom, offsetX: cfg.offsetX, offsetY: cfg.offsetY, mirror: cfg.mirror,
  };
}

/** Decodes backdrops and blends them beneath the frame.
 *  One per Film, so one per render worker — each worker sweeps a contiguous
 *  frame range, which keeps every decoder on its sequential fast path. */
export class BackdropPass {
  private pool: SourcePool;
  /** measured clip lengths, so looping does not re-probe every frame */
  private lengths = new Map<string, number>();

  constructor(fps: number, private enabled = true) {
    this.pool = new SourcePool(fps);
  }

  /** Clip length, measured once. Stills report 0 and simply never loop. */
  async lengthOf(src: string): Promise<number> {
    if (!this.lengths.has(src)) {
      const s = await this.pool.get(src);
      this.lengths.set(src, s.meta.duration);
    }
    return this.lengths.get(src)!;
  }

  /** Blend the backdrop under `px`, which is mutated in place.
   *  The frame is left with its transparency intact — whatever calls this is
   *  responsible for flattening, because a camera take may still go under. */
  async apply(px: Buffer, w: number, h: number, backdrop: Backdrop | null): Promise<Buffer> {
    if (!backdrop || !this.enabled) return px;
    const src = await this.pool.get(backdrop.src);
    const layer = await src.at(backdrop.srcTime, { w, h }, backdrop.framing);
    blendUnder(px, w, h, layer, w, h, 0, 0);
    return px;
  }

  async close(): Promise<void> { await this.pool.close(); }
}
