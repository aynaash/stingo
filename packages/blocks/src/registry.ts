import { getBlock, blockNames, allBlocks, type Scene } from '@stingo/schema';
import type { BlockCtx } from './ctx';
import type { El } from '@stingo/render';

/** Importing a block module registers it. This file exists only to make sure
 *  the built-in set is loaded — there is no table here to keep in sync. */
import './text';
import './code';
import './data';
import './camera';
import './diagram';
import './image';

export function renderBlock(scene: Scene, ctx: BlockCtx): El {
  const def = getBlock(scene.block);
  if (!def) {
    throw new Error(`unknown block "${scene.block}" — registered blocks are: ${blockNames().join(', ')}`);
  }
  return def.render(scene, ctx) as El;
}

/** Kept for callers that want the map shape; derived, never hand-written. */
export const BLOCKS: Record<string, (s: any, c: BlockCtx) => El> =
  Object.fromEntries(allBlocks().map((d) => [d.name, d.render as (s: any, c: BlockCtx) => El]));

export { blockNames, allBlocks, getBlock };
