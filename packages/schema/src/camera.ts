import { z } from 'zod';

/** Where the camera sits in the frame.
 *
 *  `full`  — the take fills the frame; block content lays over it
 *  `pip`   — a corner inset over the block content
 *  `split` — the frame divides, camera on one side, block content on the other
 *
 *  The same decoded clip serves all three; only the destination box changes. */
export const CameraLayout = z.enum(['full', 'pip', 'split']);
export type CameraLayout = z.infer<typeof CameraLayout>;

export const Camera = z.object({
  /** path to the recorded take, relative to the document */
  src: z.string(),
  /** in-point within the take — where this scene starts reading from */
  from: z.union([z.number(), z.string()]).default(0),

  layout: CameraLayout.default('full'),

  /** how the take fills its box; `cover` crops, `contain` letterboxes */
  fit: z.enum(['cover', 'contain']).default('cover'),
  /** push in past the fit, for tightening a wide webcam shot */
  zoom: z.number().min(1).max(4).default(1),
  /** pan within the box, as a fraction of box size; +x right, +y down */
  offsetX: z.number().min(-1).max(1).default(0),
  offsetY: z.number().min(-1).max(1).default(0),
  /** mirror horizontally, matching the webcam preview you recorded against */
  mirror: z.boolean().default(false),

  // ── pip ──────────────────────────────────────────────────────────────
  corner: z.enum(['tl', 'tr', 'bl', 'br']).default('br'),
  /** inset width as a fraction of the canvas width */
  size: z.number().min(0.08).max(0.9).default(0.3),
  /** inset aspect ratio, width ÷ height */
  aspect: z.number().min(0.2).max(4).default(1),
  shape: z.enum(['rounded', 'circle', 'square']).default('rounded'),
  /** gap from the frame edge, as a fraction of the canvas width */
  margin: z.number().min(0).max(0.3).default(0.055),

  // ── split ────────────────────────────────────────────────────────────
  side: z.enum(['left', 'right', 'top', 'bottom']).default('left'),
  /** share of the frame the camera takes */
  ratio: z.number().min(0.2).max(0.8).default(0.5),

  // ── framing chrome ───────────────────────────────────────────────────
  /** accent outline around the camera box */
  ring: z.boolean().default(true),
  /** darken the take so overlaid text stays readable; 0 disables */
  scrim: z.number().min(0).max(1).default(0),

  // ── audio ────────────────────────────────────────────────────────────
  /** drop this take's audio from the mix */
  mute: z.boolean().default(false),
  gainDb: z.number().default(0),
});
export type Camera = z.infer<typeof Camera>;
