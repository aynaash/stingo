import { box, text, type El } from '@stingo/render';
import { clamp, interpolate } from '@stingo/core';
import type { TasteProfile } from '@stingo/schema';
import type { BlockCtx } from './ctx';
import { typeStyle } from './ctx';
import { T, type Stage } from './stage';
import { lifecycle, enterP } from './anim';
import { z } from 'zod';
import { defineBlock } from './define';
import { Camera } from '@stingo/schema';

/** Where a take lands in the frame, in canvas pixels. */
export interface Placement {
  x: number; y: number; w: number; h: number;
  /** corner radius; a circle is expressed as radius = w/2 */
  rx: number;
  shape: 'rounded' | 'circle' | 'square';
}

/** Even sizes only: ffmpeg's scalers reject odd dimensions on some pixel
 *  formats, and a half-pixel box would land the crop off-centre anyway. */
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Resolve a camera config against the stage. Pure geometry — the same numbers
 *  drive the mask, the decoder's output size, and the pixel blend, so they are
 *  computed exactly once here. */
export function cameraPlacement(cam: Camera, stage: Stage, taste: TasteProfile): Placement {
  const { w: W, h: H } = stage;

  if (cam.layout === 'full') {
    return { x: 0, y: 0, w: even(W), h: even(H), rx: 0, shape: 'square' };
  }

  if (cam.layout === 'split') {
    const vertical = cam.side === 'top' || cam.side === 'bottom';
    const w = vertical ? W : even(W * cam.ratio);
    const h = vertical ? even(H * cam.ratio) : H;
    const x = cam.side === 'right' ? W - w : 0;
    const y = cam.side === 'bottom' ? H - h : 0;
    return { x, y, w: even(w), h: even(h), rx: 0, shape: 'square' };
  }

  // pip
  const margin = Math.round(W * cam.margin);
  const w = even(W * cam.size);
  const h = cam.shape === 'circle' ? w : even(w / cam.aspect);
  const x = cam.corner === 'tl' || cam.corner === 'bl' ? margin : W - w - margin;
  const y = cam.corner === 'tl' || cam.corner === 'tr' ? margin : H - h - margin;
  const rx = cam.shape === 'circle' ? w / 2 : cam.shape === 'square' ? 0 : taste.texture.cornerRadius * 1.4;
  return { x, y, w, h, rx, shape: cam.shape };
}

/** The region left for block content when the camera takes part of the frame.
 *  Only `split` reserves space; the other layouts overlay. */
export function contentRect(cam: Camera, stage: Stage): { x: number; y: number; w: number; h: number } | null {
  if (cam.layout !== 'split') return null;
  const vertical = cam.side === 'top' || cam.side === 'bottom';
  const camW = vertical ? stage.w : Math.round(stage.w * cam.ratio);
  const camH = vertical ? Math.round(stage.h * cam.ratio) : stage.h;
  return {
    x: cam.side === 'left' ? camW : 0,
    y: cam.side === 'top' ? camH : 0,
    w: vertical ? stage.w : stage.w - camW,
    h: vertical ? stage.h - camH : stage.h,
  };
}

/** SVG mask that punches the camera box out of the layers beneath it.
 *  A mask costs one extra alpha channel; an SVG filter would cost seconds. */
export function cameraMask(p: Placement, W: number, H: number, id = 'stingo-cam'): string {
  const hole = p.shape === 'circle'
    ? `<circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${p.w / 2}" fill="#000"/>`
    : `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.rx}" ry="${p.rx}" fill="#000"/>`;
  return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">`
    + `<rect width="${W}" height="${H}" fill="#fff"/>${hole}</mask>`;
}

/** The outline drawn over the take. Sits in the front layer so it is never
 *  erased by the mask, and animates in with the scene. */
export function cameraChrome(p: Placement, cam: Camera, c: BlockCtx): string {
  if (!cam.ring || cam.layout === 'full') return '';
  const o = clamp(enterP(c.t, c.taste, 0.05));
  if (o <= 0.01) return '';
  const sw = Math.max(2, Math.round(c.stage.unit * 0.12));
  const col = c.taste.palette.accent;
  const inset = sw / 2;
  const shape = p.shape === 'circle'
    ? `<circle cx="${p.x + p.w / 2}" cy="${p.y + p.h / 2}" r="${p.w / 2 - inset}"/>`
    : `<rect x="${p.x + inset}" y="${p.y + inset}" width="${p.w - sw}" height="${p.h - sw}" rx="${Math.max(0, p.rx - inset)}" ry="${Math.max(0, p.rx - inset)}"/>`;
  return `<g fill="none" stroke="${col}" stroke-width="${sw}" opacity="${(o * 0.9).toFixed(3)}">${shape}</g>`;
}

/** A name/role card, the one piece of chrome that makes a talking head read as
 *  a produced video rather than a video call. */
function lowerThird(s: any, c: BlockCtx): El | null {
  if (!s.lower) return null;
  const { palette } = c.taste;
  const u = c.stage.unit;
  const p = enterP(c.t, c.taste, 0.35);
  return box({
    ...lifecycle(c.t, c.dur, c.taste, 'slideL', 0.35),
    flexDirection: 'column', gap: u * 0.22,
    borderLeft: `${Math.max(3, u * 0.16)}px solid ${palette.accent}`,
    paddingLeft: u * 0.7,
  },
    text({ ...typeStyle(c, 'display', T.heading(c.stage) * 0.82, palette.text) }, s.lower.name),
    s.lower.role
      ? text({ ...typeStyle(c, 'mono', T.small(c.stage) * 0.95, palette.muted) }, s.lower.role)
      : null,
  );
}

/** The `camera` block: the take itself is pixels, so everything rendered here
 *  is what goes *over* it — a readability scrim, a lower third, a caption. */
export function cameraBlock(s: any, c: BlockCtx): El {
  const cam: Camera = s.camera;
  const st = c.stage;
  const { palette } = c.taste;
  const kids: (El | null)[] = [];

  if (s.lower || s.caption) {
    kids.push(box({
      position: 'absolute', left: st.padX, right: st.padX, bottom: st.padY * 0.62,
      flexDirection: 'column', gap: st.unit * 0.6, alignItems: 'flex-start',
    },
      lowerThird(s, c),
      s.caption ? text({
        ...typeStyle(c, 'body', T.body(st) * 0.92, palette.text),
        ...lifecycle(c.t, c.dur, c.taste, 'rise', 0.5),
        maxWidth: st.contentW * 0.8,
      }, s.caption) : null,
    ));
  }

  return box({ width: st.w, height: st.h, position: 'relative' },
    // the scrim belongs in the element tree, not the front layer: it has to sit
    // under the caption while still covering the take
    cam.scrim > 0
      ? box({ position: 'absolute', left: 0, top: 0, width: st.w, height: st.h, background: hexA(palette.bg, cam.scrim) })
      : null,
    ...kids,
  );
}

/** #rrggbb + alpha → rgba(), since satori has no colour-mix. */
function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h.slice(0, 6);
  const v = parseInt(n, 16);
  return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a.toFixed(3)})`;
}


/* ── registration ───────────────────────────────────────────────────────── */

defineBlock({
  name: 'camera',
  describe: 'A recorded take composited into the scene — full frame, corner pip, or split.',
  fields: {
    camera: Camera,
    caption: z.string().optional(),
    lower: z.object({ name: z.string(), role: z.string().optional() }).optional(),
  },
  duration: {
    base: 8,
    // a talking-head scene runs as long as the take does
    exact: true,
    estimate: (s: any, ctx) => {
      const len = ctx.clips?.get(s.camera.src);
      if (len == null) return null;
      const remaining = len - ctx.seconds(s.camera.from, 0);
      return remaining > 0.05 ? remaining : null;
    },
  },
  broll: { kind: 'none', opacity: 0 },
  render: cameraBlock,
});
