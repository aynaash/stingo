import type { TasteProfile, Scene } from '@stingo/schema';
import type { Stage } from './stage';
import type { BeatGrid } from '@stingo/core';
import type { El } from '@stingo/render';

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
