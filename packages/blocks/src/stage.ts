import type { TasteProfile } from '@stingo/schema';

/** Orientation-aware layout constants. One composition, both aspect ratios:
 *  everything downstream sizes from `stage`, never from raw pixels. */
export interface Stage {
  w: number; h: number;
  orientation: 'portrait' | 'landscape' | 'square';
  /** side padding that keeps content clear of platform UI */
  padX: number; padY: number;
  /** the safe content column */
  contentW: number;
  /** base font size; every type size is a multiple of this */
  unit: number;
  /** vertical stacks in portrait, horizontal splits in landscape */
  splitDir: 'column' | 'row';
}

export function makeStage(w: number, h: number, taste: TasteProfile): Stage {
  const orientation = w > h ? 'landscape' : w === h ? 'square' : 'portrait';
  // portrait reserves more vertical room for platform chrome (captions, UI overlays)
  const padX = Math.round(w * (orientation === 'portrait' ? 0.085 : 0.075));
  const padY = Math.round(h * (orientation === 'portrait' ? 0.13 : 0.09));
  const unit = Math.round(Math.min(w, h) * 0.0295 * taste.type.scale);
  return { w, h, orientation, padX, padY, contentW: w - padX * 2, unit, splitDir: orientation === 'landscape' ? 'row' : 'column' };
}

/** Type scale, in stage units. Keeps sizes consistent across blocks and formats. */
export const T = {
  kicker: (s: Stage) => s.unit * 0.82,
  display: (s: Stage) => s.unit * (s.orientation === 'portrait' ? 2.85 : 2.5),
  title: (s: Stage) => s.unit * 2.05,
  heading: (s: Stage) => s.unit * 1.45,
  body: (s: Stage) => s.unit * 1.05,
  small: (s: Stage) => s.unit * 0.85,
  code: (s: Stage) => s.unit * (s.orientation === 'portrait' ? 0.96 : 0.88),
  huge: (s: Stage) => s.unit * (s.orientation === 'portrait' ? 4.6 : 4.0),
};

/** A stage confined to a sub-rectangle of the canvas. Blocks size everything
 *  from the stage, so a split-screen scene needs no per-block awareness: it
 *  just gets a smaller stage and a container that offsets it. */
export function substage(s: Stage, w: number, h: number): Stage {
  const orientation = w > h ? 'landscape' : w === h ? 'square' : 'portrait';
  const padX = Math.round(w * (orientation === 'portrait' ? 0.085 : 0.075));
  const padY = Math.round(h * (orientation === 'portrait' ? 0.13 : 0.09));
  // the type scale stays tied to the *canvas*, not the panel: text that shrank
  // with the panel would be unreadable next to a full-size neighbouring scene
  return { w, h, orientation, padX, padY, contentW: w - padX * 2, unit: s.unit, splitDir: orientation === 'landscape' ? 'row' : 'column' };
}
