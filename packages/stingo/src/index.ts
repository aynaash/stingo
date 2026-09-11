/**
 * stingo — declarative video for people who ship content.
 *
 * Two ways in:
 *   1. a YAML/JSON document rendered with `stingo render video.yaml`
 *   2. the typed builder API below, rendered with `stingo render film.ts`
 *
 * Both produce the same validated document and go through the same renderer.
 */

// authoring
export * from './build';

// documents and validation
export {
  VideoDoc, Scene, TasteProfile, Broll, Canvas, Palette, Typography, Motion,
  Pacing, Texture, CANVAS_PRESETS, parseVideo, parseTaste,
} from '@stingo/schema';

// timing, easing, musical time
export {
  interpolate, spring, springDuration, stagger, lerp, clamp, rng,
  EASINGS, ease, type Easing, PERSONALITY_EASE,
  Timeline, toSeconds, snap, beat, bar, beatDur, barDur, speakDuration,
  DEFAULT_GRID, type BeatGrid, type Cue,
} from '@stingo/core';

// taste: built-ins, derivation, audit, colour
export {
  THEMES, bootdev, dusk, type ThemeName,
  HOUSE, derive, audit, repair, type TasteSeed, type AuditIssue,
  contrast, ensureContrast, luminance, mix, atLightness, rotateHue,
  hexToOklab, oklabToHex, hexToRgb, rgbToHex,
} from '@stingo/themes';

// rendering
export { Renderer, composite, TexturePass, loadFonts, resolveFamily, h, box, text, abs, type El } from '@stingo/render';
export { Film, plan, estimateDuration, renderVideo, rgbaToPng, type RenderOpts, type RenderResult, type FilmOpts } from '@stingo/film';

// blocks, b-roll and layout, for extending the library
export {
  BLOCKS, renderBlock, GENERATORS, renderBroll, brollDefs,
  makeStage, T, type Stage, type BlockCtx,
  animStyle, lifecycle, enterP, exitP, typed, tasteEase,
  initHighlighter, tokenize, CODE_THEMES,
} from '@stingo/blocks';

// audio
export {
  analyzeBeats, onsetEnvelope, estimateTempo, estimateOffset, pickOnsets,
  decodePcm, mixAudio, measureLoudness, fft, hann, type BeatAnalysis,
} from '@stingo/audio';

// real footage: probe a file, read it as a pure function of time, composite it
export {
  VideoSource, SourcePool, probeVideo, blendUnder, flattenOnto,
  DEFAULT_FRAMING, type VideoMeta, type Framing, type Box,
} from '@stingo/media';

// encoding
export { Encoder, ffmpegVersion, hasEncoder, duration as probeDuration, type EncodeOpts } from '@stingo/encode';

export const VERSION = '0.1.0';
