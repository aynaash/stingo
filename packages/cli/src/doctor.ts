import { basename, dirname, relative, resolve } from 'node:path';
import { ffmpegVersion, hasEncoder } from '@stingo/encode';
import { defaultFontDir, loadFonts, norm, type LoadedFont } from '@stingo/render';
import { audit, repair, DEFAULT_TASTE, THEMES, themeName } from '@stingo/themes';
import { probeClips, plan, checkTextFits, sayWarnings } from '@stingo/film';
import { analyzeBeats } from '@stingo/audio';
import { DEFAULT_GRID, type BeatGrid } from '@stingo/core';
import type { TasteProfile, VideoDoc } from '@stingo/schema';
import { loadDoc, loadTaste, tasteCandidates } from './load';

/** One pass over everything a render needs.
 *
 *  The reason this exists is arithmetic. Each check that throws on the first
 *  problem turns a session into one fix per run: install ffmpeg, run again,
 *  find the missing track, run again, find the missing take. Five problems is
 *  five renders to discover and five to confirm. Finding all of them at once
 *  costs the same work and takes one run.
 *
 *  Nothing here is allowed to throw. A check that cannot be performed reports
 *  that it could not be performed, which is itself a result. */

export type Level = 'ok' | 'warn' | 'error';

export interface Check {
  /** the thing being checked, e.g. "ffmpeg", "takes" */
  area: string;
  level: Level;
  message: string;
  /** what to do about it, when there is something to do */
  fix?: string;
}

export interface Report {
  file: string;
  title: string;
  checks: Check[];
  get errors(): number;
}

const ok = (area: string, message: string): Check => ({ area, level: 'ok', message });
const warn = (area: string, message: string, fix?: string): Check => ({ area, level: 'warn', message, fix });
const bad = (area: string, message: string, fix?: string): Check => ({ area, level: 'error', message, fix });

/** ffmpeg is not optional: it decodes footage, mixes audio and encodes video. */
async function checkFfmpeg(): Promise<Check[]> {
  let version: string;
  try {
    version = await ffmpegVersion();
  } catch {
    return [bad('ffmpeg', 'not on your PATH', 'install ffmpeg 6 or newer — `brew install ffmpeg`, `apt install ffmpeg`')];
  }
  const out = [ok('ffmpeg', version)];
  const major = Number(/(\d+)/.exec(version)?.[1] ?? 0);
  if (major && major < 6) {
    out.push(warn('ffmpeg', `version ${major} is older than the 6 this is tested against`, 'upgrade ffmpeg if a render fails oddly'));
  }
  if (!(await hasEncoder('libx264'))) {
    out.push(bad('ffmpeg', 'no libx264 encoder', 'install an ffmpeg build with libx264 — most distribution packages have it'));
  }
  return out;
}

/** Fonts: the directory resolves, and the taste's three families are really
 *  there rather than quietly falling back to whatever loaded first. */
async function checkFonts(taste: TasteProfile): Promise<Check[]> {
  let dir: string;
  let fonts: LoadedFont[];
  try {
    dir = defaultFontDir();
    fonts = await loadFonts(dir);
  } catch (e: any) {
    return [bad('fonts', e.message, 'set STINGO_FONTS to a directory of .ttf/.otf files')];
  }

  const out = [ok('fonts', `${fonts.length} faces in ${dir}`)];
  const wanted: [string, { family: string; weight: number }][] = [
    ['display', taste.type.display], ['body', taste.type.body], ['mono', taste.type.mono],
  ];
  for (const [role, spec] of wanted) {
    const family = fonts.filter((f) => norm(f.name) === norm(spec.family));
    if (!family.length) {
      out.push(warn('fonts', `taste asks for "${spec.family}" for ${role} text and no such family is loaded`,
        `add a ${spec.family} .ttf/.otf to ${dir}, or change \`type.${role}.family\` in the taste`));
      continue;
    }
    if (!family.some((f) => f.weight === spec.weight)) {
      const have = [...new Set(family.map((f) => f.weight))].sort((a, b) => a - b);
      out.push(warn('fonts', `"${spec.family}" has no weight ${spec.weight} face for ${role} text — nearest of ${have.join(', ')} is used`,
        `add ${spec.family} at weight ${spec.weight}, or set \`type.${role}.weight\` to one of ${have.join(', ')}`));
    }
  }
  return out;
}

/** The taste resolves, and clears the house contrast floors. */
async function checkTaste(ref: unknown, dir: string): Promise<{ checks: Check[]; taste: TasteProfile | null }> {
  let taste: TasteProfile;
  try {
    taste = await loadTaste(ref as string, dir);
  } catch (e: any) {
    const looked = typeof ref === 'string' ? tasteCandidates(ref, dir) : [];
    return {
      taste: null,
      checks: [bad('taste', e.message, looked.length ? `looked in ${[...new Set(looked.map(rel))].join(', ')}` : undefined)],
    };
  }

  const checks = [ok('taste', `"${taste.name}" (${taste.id})`)];
  const issues = audit(taste);
  const fixable = new Set(repair(taste).applied.map((a) => a.field));
  for (const i of issues) {
    // a colour stingo repairs at render time is worth knowing about but is not
    // a reason to stop; one it cannot repair is the author's to fix
    const auto = fixable.has(i.field);
    checks.push({
      area: 'taste',
      level: auto ? 'warn' : i.level === 'error' ? 'error' : 'warn',
      message: `${i.field} ${i.message}${auto ? ' (repaired at render time)' : ''}`,
      fix: i.fix,
    });
  }
  return { checks, taste };
}

/** Music: declared, readable, and a tempo that can actually be found in it.
 *
 *  `free` says cuts cannot be snapped, which is a different thing from having
 *  no music: a film with no music still cuts on the taste's nominal grid, while
 *  a film whose declared track is missing has no grid to cut to at all. */
async function checkMusic(doc: VideoDoc): Promise<{ checks: Check[]; grid: BeatGrid | null; free: boolean }> {
  const music = doc.audio.music;
  if (!music) {
    return { checks: [ok('music', 'none declared — scenes cut on their own content')], grid: null, free: false };
  }

  if (!(await Bun.file(music).exists())) {
    return {
      grid: null, free: true,
      checks: [bad('music', `${rel(music)} does not exist`,
        'point `audio.music` at a track, or remove the `audio:` block — cuts then fall back to free timing')],
    };
  }

  try {
    const a = await analyzeBeats(music, { bpm: typeof doc.audio.bpm === 'number' ? doc.audio.bpm : undefined });
    const checks = [ok('music', `${basename(music)} · ${a.bpm} BPM · downbeat ${a.offset.toFixed(3)}s · ${a.duration.toFixed(1)}s`)];
    if (a.confidence < 0.5 && typeof doc.audio.bpm !== 'number') {
      checks.push(warn('music', `tempo confidence is ${(a.confidence * 100).toFixed(0)}% — the detected ${a.bpm} BPM may be wrong`,
        `set \`audio.bpm\` explicitly if cuts land off the beat`));
    }
    return { checks, grid: { bpm: a.bpm, offset: a.offset, beatsPerBar: a.beatsPerBar, onsets: a.onsets }, free: false };
  } catch (e: any) {
    return {
      grid: null, free: true,
      checks: [bad('music', `${basename(music)} could not be decoded — ${firstLine(e.message)}`,
        'check the file plays, and that ffmpeg can read the format')],
    };
  }
}

/** Takes, and the arithmetic that decides whether they are long enough. */
function checkTakes(doc: VideoDoc, info: Awaited<ReturnType<typeof probeClips>>['info'], missing: string[], needed: Map<string, number>): Check[] {
  const refs = new Set(doc.scenes.map((s) => s.camera?.src).filter(Boolean) as string[]);
  if (!refs.size) return [ok('takes', 'no camera scenes')];

  const out: Check[] = [];
  for (const m of missing) {
    out.push(warn('takes', `${rel(m)} is not readable`,
      'shoot it, or render with --no-camera to draw a placeholder carrying the source timecode'));
  }
  for (const i of info) {
    const need = needed.get(i.src) ?? 0;
    const parts = [`${basename(i.src)} ${i.width}x${i.height} ${i.fps.toFixed(2)}fps ${i.duration.toFixed(1)}s`];
    if (!i.hasAudio) parts.push('no audio track');
    out.push(ok('takes', parts.join(' · ')));
    if (need > i.duration + 0.05) {
      out.push(warn('takes', `${basename(i.src)} is ${(need - i.duration).toFixed(1)}s short of what the script reads from it — the last frame will hold`,
        `shoot ${Math.ceil(need)}s, or shorten the scenes using it`));
    }
    if (i.fps < doc.canvas.fps - 0.5) {
      out.push(warn('takes', `${basename(i.src)} is ${i.fps.toFixed(2)}fps into a ${doc.canvas.fps}fps canvas — frames will be duplicated`,
        `set \`canvas.fps: ${Math.round(i.fps)}\`, or reshoot at ${doc.canvas.fps}fps`));
    }
  }
  return out;
}

/** Every still and backdrop a script points at. These are read straight off
 *  disk during render, so a missing one is a dead scene, not a placeholder. */
async function checkImages(doc: VideoDoc): Promise<Check[]> {
  const refs: { src: string; where: string }[] = [];
  doc.scenes.forEach((s: any, i) => {
    if (s.block === 'image' && s.src) refs.push({ src: s.src, where: `scene ${i} image` });
    if (s.bg?.src) refs.push({ src: s.bg.src, where: `scene ${i} backdrop` });
  });
  if (!refs.length) return [ok('images', 'none referenced')];

  const out: Check[] = [];
  let found = 0;
  for (const r of refs) {
    if (await Bun.file(r.src).exists()) { found++; continue; }
    out.push(bad('images', `${r.where}: ${rel(r.src)} does not exist`,
      'fix the path — it is resolved next to the document first, then against the working directory'));
  }
  if (found) out.unshift(ok('images', `${found} of ${refs.length} source${refs.length > 1 ? 's' : ''} readable`));
  return out;
}

const firstLine = (s: string) => String(s).split('\n')[0]!.trim();

/** Paths read better relative to where the command was run. loadDoc resolves
 *  every asset to an absolute path so the render workers can find it, which is
 *  right and unreadable. */
const rel = (p: string) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

/** Run every check against one document. */
export async function doctorDoc(file: string, tasteFlag?: string): Promise<Report> {
  const checks: Check[] = [];
  checks.push(...(await checkFfmpeg()));

  let doc: VideoDoc;
  try {
    doc = await loadDoc(file);
  } catch (e: any) {
    checks.push(bad('document', firstLine(e.message), 'run `stingo blocks` for the fields each scene type takes'));
    return report(file, basename(file), checks);
  }
  checks.push(ok('document', `${doc.scenes.length} scene${doc.scenes.length === 1 ? '' : 's'} · ${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps`));

  const dir = dirname(resolve(file));
  const { checks: tasteChecks, taste: resolved } = await checkTaste(tasteFlag || doc.taste, dir);
  checks.push(...tasteChecks);

  // A taste that will not resolve is an error, not the end of the report. Every
  // remaining check needs *a* taste, and the default is as good as any for
  // measuring whether the text fits and the takes are long enough — which are
  // the other things the author has to fix anyway.
  const taste = resolved ?? THEMES[DEFAULT_TASTE];
  if (!resolved) {
    checks.push(warn('taste', `the rest of this report assumes "${taste.name}"`,
      'fix the taste and run again — layout and pacing depend on it'));
  }

  checks.push(...(await checkFonts(taste)));

  const { checks: musicChecks, grid, free } = await checkMusic(doc);
  checks.push(...musicChecks);

  // a document whose declared music is missing still plans — on a nominal grid,
  // with cuts free, which is what the renderer falls back to as well
  const effective = grid ?? DEFAULT_GRID;
  const cutting = free ? freeCutting(taste) : taste;
  const { clips, info, missing } = await probeClips(doc);
  const { timeline, warnings } = plan(doc, cutting, effective, clips);

  const needed = new Map<string, number>();
  doc.scenes.forEach((s, i) => {
    const src = s.camera?.src;
    if (!src) return;
    const cue = timeline.cues[i];
    const from = typeof s.camera!.from === 'number' ? s.camera!.from : 0;
    needed.set(src, Math.max(needed.get(src) ?? 0, from + (cue?.dur ?? 0)));
  });

  checks.push(...checkTakes(doc, info, missing, needed));
  checks.push(...(await checkImages(doc)));

  for (const w of warnings) checks.push(warn('timing', w));
  for (const w of sayWarnings(doc, cutting, timeline)) checks.push(warn('narration', w));

  try {
    const fits = await checkTextFits(doc, taste);
    if (fits.length) for (const w of fits) checks.push(warn('layout', w, 'shorten the line, or give the scene a `plain: true` full-width stage'));
    else checks.push(ok('layout', 'every line fits its frame'));
  } catch (e: any) {
    checks.push(warn('layout', `could not be checked — ${firstLine(e.message)}`));
  }

  checks.push(ok('timing', `${fmt(timeline.duration)} · ${timeline.frameCount} frames · cuts on ${cutting.pacing.cutOn}`));
  return report(file, doc.title, checks);
}

/** A taste with grid snapping switched off, for planning without a tempo. */
export const freeCutting = (taste: TasteProfile): TasteProfile =>
  ({ ...taste, pacing: { ...taste.pacing, cutOn: 'free' } });

/** Is this argument a video document, or a taste? `doctor` takes both, and the
 *  answer decides which report gets run. A built-in theme name wins outright;
 *  otherwise a parsed object carrying `scenes` is a document. */
export async function looksLikeDoc(ref: string): Promise<boolean> {
  if (themeName(ref) || ref in THEMES) return false;
  if (/\.(ts|tsx|js|mjs)$/i.test(ref)) return true;
  if (!(await Bun.file(ref).exists())) return false;
  try {
    const raw = await Bun.file(ref).text();
    const data = /\.json$/i.test(ref) ? JSON.parse(raw) : (await import('yaml')).parse(raw);
    return Array.isArray(data?.scenes);
  } catch {
    return false;
  }
}

function report(file: string, title: string, checks: Check[]): Report {
  return { file, title, checks, get errors() { return checks.filter((c) => c.level === 'error').length; } };
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
