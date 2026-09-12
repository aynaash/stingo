import type { TasteProfile, Scene } from '@stingo/schema';
import type { Stage } from './stage';
import type { BeatGrid } from '@stingo/core';
import type { El, FitOpts, FitResult } from '@stingo/render';

export interface BlockCtx {
  /** seconds since this scene started */
  t: number;
  /** scene length in seconds */
  dur: number;
  /** absolute seconds since video start */
  abs: number;
  stage: Stage;
  taste: TasteProfile;
  grid: BeatGrid;
  /** resolve a font family name against what is actually loaded */
  family: (name: string) => string;
  /** Largest size at or below `size` at which `text` fits the given box.
   *  satori will not shrink text to fit, so a block that does not ask for this
   *  is a block that can render a headline off the edge of the frame. */
  fit: (text: string, kind: 'display' | 'body' | 'mono', size: number, opts: FitOpts) => FitResult;
  /** The tokens that will actually be laid out at this size — words, with any
   *  word too long for the line already broken. Render these, not a raw split. */
  tokens: (text: string, kind: 'display' | 'body' | 'mono', size: number, maxWidth: number) => string[];
  /** Width of the gap between two words, in pixels, as the measurement assumed
   *  it: the face's own space advance plus the tracking either side of it.
   *
   *  A block that lays words out as separate flex children has to use this for
   *  its column gap. Anything else and the wrap that was fitted is not the wrap
   *  that gets drawn — and at display sizes in a monospace face, a gap narrower
   *  than a space makes two words read as one. */
  space: (kind: 'display' | 'body' | 'mono', size: number) => number;
  /** scene index, for deterministic per-scene variation */
  index: number;
}

export type BlockRenderer<S extends Scene = Scene> = (scene: S, ctx: BlockCtx) => El;

export const fam = {
  display: (c: BlockCtx) => c.family(c.taste.type.display.family),
  body: (c: BlockCtx) => c.family(c.taste.type.body.family),
  mono: (c: BlockCtx) => c.family(c.taste.type.mono.family),
};

/** Type style helpers that fold a taste profile's font spec into satori styles. */
export const typeStyle = (c: BlockCtx, kind: 'display'|'body'|'mono', size: number, color: string) => {
  const spec = c.taste.type[kind];
  return {
    fontFamily: fam[kind](c),
    fontSize: size,
    fontWeight: spec.weight,
    letterSpacing: `${(spec.tracking * size).toFixed(2)}px`,
    lineHeight: spec.lineHeight,
    color,
    ...(spec.transform === 'upper' ? { textTransform: 'uppercase' as const } : {}),
  };
};
