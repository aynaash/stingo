import { defineBlock as register, type BlockDef } from '@stingo/schema';
import type { BlockCtx } from './ctx';
import type { El } from '@stingo/render';
import type { z } from 'zod';

/** `defineBlock`, bound to this package's render context and element type.
 *
 *  A block is one call: its fields, how long it wants to be on screen, what
 *  plays behind it, and how to draw it. Importing the module registers it —
 *  there is no central list to edit. */
export function defineBlock<Shape extends z.ZodRawShape>(
  def: Omit<BlockDef<Shape, BlockCtx, El>, 'render'> & {
    render: (scene: any, ctx: BlockCtx) => El;
  },
) {
  return register<Shape, BlockCtx, El>(def as any);
}

export type { BlockDef };
