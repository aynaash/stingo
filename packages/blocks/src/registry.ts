import type { Scene } from '@stingo/schema';
import type { BlockCtx } from './ctx';
import type { El } from '@stingo/render';
import { titleBlock, statementBlock, quoteBlock, listBlock, outroBlock, brollBlock } from './text';
import { codeBlock, terminalBlock } from './code';
import { statBlock, chartBlock, compareBlock } from './data';
import { cameraBlock } from './camera';

export const BLOCKS: Record<Scene['block'], (s: any, c: BlockCtx) => El> = {
  title: titleBlock,
  statement: statementBlock,
  quote: quoteBlock,
  list: listBlock,
  outro: outroBlock,
  broll: brollBlock,
  code: codeBlock,
  terminal: terminalBlock,
  stat: statBlock,
  chart: chartBlock,
  compare: compareBlock,
  camera: cameraBlock,
};

export function renderBlock(scene: Scene, ctx: BlockCtx): El {
  const fn = BLOCKS[scene.block];
  if (!fn) throw new Error(`unknown block: ${(scene as any).block}`);
  return fn(scene, ctx);
}
