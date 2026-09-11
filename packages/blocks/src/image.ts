import { z } from 'zod';
import { box, text, h, type El } from '@stingo/render';
import { clamp, interpolate } from '@stingo/core';
import { defineBlock } from './define';
import { typeStyle, type BlockCtx } from './ctx';
import { T } from './stage';
import { lifecycle, enterP } from './anim';
import { windowFrame, kicker } from './chrome';
import { imageInfo, fitBox } from './imageinfo';

/** A still: a screenshot, a photo, a chart someone else made.
 *
 *  KNOWN COST: an image frame takes roughly 350ms against 33ms for a text
 *  frame. Measured split: satori 23ms, resvg 208ms. The time goes on resvg
 *  resampling the bitmap into the canvas, and it is paid on every frame because
 *  the image lives in the SVG. Downscaling the source barely helps — 2.6MB to
 *  0.8MB moved it 405ms to 350ms — because the cost is resampling, not decoding.
 *
 *  The fix is to decode once and composite in the pixel pass, which is what
 *  CameraPass already does for video takes. It needs a general way for a block
 *  to declare pixel layers, so it is deliberately left undone rather than
 *  special-cased here. In the meantime a handful of image scenes in a film cost
 *  a few seconds of render time, which is a fine trade; a film that is mostly
 *  images is not. */

export function imageBlock(s: any, c: BlockCtx): El {
  const st = c.stage;
  const { palette, texture } = c.taste;
  const info = imageInfo(s.src);

  const framed = s.frame !== 'none';
  const captionH = s.caption ? T.small(st) * 2.4 : 0;
  const chromeH = s.frame === 'window' ? st.unit * 1.9 : 0;

  const boxW = st.contentW;
  const boxH = st.h - st.padY * 2 - captionH - chromeH;
  const fitted = fitBox(info, { w: boxW, h: boxH }, s.fit ?? 'contain');

  // a slow push-in keeps a still from reading as a freeze
  const p = c.dur > 0 ? clamp(c.t / c.dur) : 0;
  const zoom = 1 + (s.drift ?? 0.05) * p;

  const img = h('img', {
    src: info.dataUri,
    width: Math.round(fitted.w * zoom),
    height: Math.round(fitted.h * zoom),
  });

  const enter = lifecycle(c.t, c.dur, c.taste, s.enter?.kind ?? 'pop', 0);

  const picture = box({
    width: Math.round(fitted.w), height: Math.round(fitted.h),
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
    borderRadius: s.frame === 'window' ? 0 : texture.cornerRadius,
    ...(s.frame === 'plain' ? { border: `2px solid ${palette.border}` } : {}),
  }, img);

  const content = s.frame === 'window'
    ? windowFrame(c, s.title ?? 'preview', picture, { ...enter })
    : box({ ...enter, flexDirection: 'column' }, picture);

  return box({
    width: st.w, height: st.h, flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    padding: `${st.padY}px ${st.padX}px`, gap: st.unit * 0.7,
  },
    s.kicker ? kicker(s.kicker, c, 0) : null,
    content,
    s.caption
      ? text({
          ...typeStyle(c, 'body', T.small(st), palette.muted),
          ...lifecycle(c.t, c.dur, c.taste, 'fade', 0.35),
          textAlign: 'center', maxWidth: st.contentW * 0.9,
        }, s.caption)
      : null,
  );
}

defineBlock({
  name: 'image',
  describe: 'A still — screenshot, photo or diagram — with an optional frame and caption.',
  fields: {
    src: z.string(),
    fit: z.enum(['contain', 'cover']).default('contain'),
    frame: z.enum(['none', 'plain', 'window']).default('plain'),
    title: z.string().optional(),
    kicker: z.string().optional(),
    caption: z.string().optional(),
    /** slow push-in over the scene; 0 holds the image still */
    drift: z.number().default(0.05),
  },
  duration: { base: 5 },
  broll: { kind: 'mesh', opacity: 0.3 },
  render: imageBlock,
});
