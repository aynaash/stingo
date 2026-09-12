/** An MCP server for stingo.
 *
 *  The point of putting a video tool behind MCP is not automation for its own
 *  sake — it is the feedback loop. An agent that writes a script can render a
 *  frame of it and *look at the frame*, because `still` returns the image
 *  itself rather than a path. Writing video without ever seeing one is how you
 *  get scripts that validate and look wrong.
 *
 *  Everything here is a thin wrapper over the same library the CLI uses. No
 *  behaviour lives in this package.
 *
 *      stingo-mcp                      # stdio, for a local MCP client
 *
 *  Nothing may print to stdout: it is the protocol channel. Diagnostics go to
 *  stderr, and the render workers' own output is piped, never inherited.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { basename, dirname, join, resolve } from 'node:path';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';

import { loadDoc, loadTaste } from '@stingo/cli/src/load';
import { Film, plan, renderVideo, probeClips, sayWarnings } from '@stingo/film';
import { analyzeBeats, measureLoudness } from '@stingo/audio';
import { THEMES, derive, audit, contrast, HOUSE } from '@stingo/themes';
import { parseVideo, CANVAS_PRESETS } from '@stingo/schema';
import { DEFAULT_GRID, toSeconds, type BeatGrid } from '@stingo/core';
import { BLOCKS } from '@stingo/blocks';

const VERSION = '0.1.0';

type Content =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

const text = (s: string): Content => ({ type: 'text', text: s });
const ok = (...c: Content[]) => ({ content: c });
const fail = (e: unknown) => ({
  content: [text(e instanceof Error ? e.message : String(e))],
  isError: true as const,
});

/** Documentation is read from the repository rather than restated here, so an
 *  agent and the website can never disagree. Falls back to the published site
 *  when the package is installed without its docs directory. */
async function docPage(slug: string): Promise<string> {
  const local = resolve(dirname(Bun.fileURLToPath(import.meta.url)), '../../../docs/content', `${slug}.md`);
  const f = Bun.file(local);
  if (await f.exists()) return f.text();
  const res = await fetch(`https://aynaash.github.io/stingo/${slug}.md`);
  if (!res.ok) throw new Error(`no documentation for "${slug}"`);
  return res.text();
}

const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** A script may arrive as a path or as inline source. Inline gets written to a
 *  scratch file so relative references (taste, music, takes) resolve the same
 *  way they would on disk — one code path, not two. */
async function withScript<T>(
  args: { path?: string; source?: string; format?: 'yaml' | 'json'; baseDir?: string },
  fn: (file: string) => Promise<T>,
): Promise<T> {
  if (args.path) return fn(resolve(args.path));
  if (!args.source) throw new Error('give either `path` to a document or inline `source`');

  // validate before touching the disk, so a typo reports as a schema error
  parseVideo(args.format === 'json' ? JSON.parse(args.source) : parseYaml(args.source));

  const base = args.baseDir ? resolve(args.baseDir) : process.cwd();
  const dir = await mkdtemp(join(tmpdir(), 'stingo-mcp-'));
  try {
    // sit the scratch file inside the base directory so `./taste.json` and
    // `takes/01.mp4` resolve against the caller's project, not the temp dir
    const file = join(base, `.stingo-mcp-${basename(dir)}.${args.format ?? 'yaml'}`);
    await Bun.write(file, args.source);
    try { return await fn(file); } finally { await rm(file, { force: true }); }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const scriptInput = {
  path: z.string().optional().describe('path to a .yaml/.json/.ts video document'),
  source: z.string().optional().describe('inline document source, if no path'),
  format: z.enum(['yaml', 'json']).optional().describe('format of `source` (default yaml)'),
  baseDir: z.string().optional().describe('directory that relative paths in `source` resolve against'),
  taste: z.string().optional().describe('override the taste: a built-in name or a path'),
  orientation: z.enum(['vertical', 'horizontal', 'square']).optional(),
};

async function prepare(a: any) {
  const doc = await loadDoc(a.path ? resolve(a.path) : a.file);
  if (a.orientation) Object.assign(doc.canvas, CANVAS_PRESETS[a.orientation as keyof typeof CANVAS_PRESETS]);
  doc.canvas.orientation = doc.canvas.width > doc.canvas.height ? 'landscape'
    : doc.canvas.width === doc.canvas.height ? 'square' : 'portrait';
  const taste = await loadTaste(a.taste || doc.taste, dirname(resolve(a.path ?? a.file)));

  let grid: BeatGrid = DEFAULT_GRID;
  const notes: string[] = [];
  let free = false;
  if (doc.audio.music) {
    // a missing track never blocked planning, but it used to do so in silence,
    // leaving the cut snapped to a nominal 120 BPM that no track has — a plan
    // that is wrong in a way that looks right. Say so, and cut free instead.
    try {
      const b = await analyzeBeats(doc.audio.music, {
        bpm: typeof doc.audio.bpm === 'number' ? doc.audio.bpm : undefined,
      });
      grid = { bpm: b.bpm, offset: b.offset, beatsPerBar: b.beatsPerBar, onsets: b.onsets };
    } catch (e: any) {
      free = typeof doc.audio.bpm !== 'number';
      notes.push(
        `music ${doc.audio.music} could not be read — ${String(e.message).split('\n')[0]!.trim()}. `
        + 'Cutting free and rendering without music; point `audio.music` at a track, or remove the `audio:` block',
      );
    }
  }
  const cutting = free ? { ...taste, pacing: { ...taste.pacing, cutOn: 'free' as const } } : taste;
  const { clips, info, missing } = await probeClips(doc);
  return { doc, taste: cutting, grid, clips, info, missing, notes };
}

export function createServer() {
  const server = new McpServer({ name: 'stingo', version: VERSION });

  server.registerTool('stingo_validate', {
    title: 'Validate a video document',
    description:
      'Parse a stingo script and report either the resolved document or the exact schema errors. '
      + 'Call this before rendering anything — it is instant and catches most mistakes.',
    inputSchema: scriptInput,
  }, async (a: any) => {
    try {
      return await withScript(a, async (file) => {
        const { doc, taste, missing, notes } = await prepare({ ...a, file });
        const counts = doc.scenes.reduce<Record<string, number>>((m, s) => {
          m[s.block] = (m[s.block] ?? 0) + 1; return m;
        }, {});
        return ok(text([
          `valid · "${doc.title}"`,
          `${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps (${doc.canvas.orientation})`,
          `taste "${taste.name}" · ${doc.scenes.length} scenes`,
          `blocks: ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(', ')}`,
          doc.audio.music ? `music: ${basename(doc.audio.music)}` : 'no music',
          ...notes.map((n) => `warning: ${n}`),
          ...missing.map((m) => `warning: camera source not readable — ${m}`),
        ].join('\n')));
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_plan', {
    title: 'Resolve the timeline',
    description:
      'Print the cut: every scene with its start, end, length in seconds and in beats, without '
      + 'rendering a frame. Use it to check pacing before spending minutes on a render.',
    inputSchema: scriptInput,
  }, async (a: any) => {
    try {
      return await withScript(a, async (file) => {
        const { doc, taste, grid, clips, missing, notes } = await prepare({ ...a, file });
        const { timeline, warnings } = plan(doc, taste, grid, clips);
        const beat = 60 / grid.bpm;
        const rows = timeline.cues.map((c) => {
          const cam = doc.scenes[c.index]?.camera;
          return `${String(c.index).padStart(2)}  ${c.block.padEnd(10)} ${fmtT(c.start)}→${fmtT(c.end)}  `
            + `${c.dur.toFixed(2)}s (${(c.dur / beat).toFixed(1)} beats)  ${c.id}`
            + (cam ? `  [camera: ${cam.layout}]` : '');
        });
        return ok(text([
          `${doc.title} · ${doc.canvas.width}x${doc.canvas.height}@${doc.canvas.fps}`,
          `taste "${taste.name}" · ${grid.bpm.toFixed(1)} BPM · cuts on ${taste.pacing.cutOn}`,
          '',
          ...rows,
          '',
          `total ${fmtT(timeline.duration)} · ${timeline.frameCount} frames`,
          ...notes.map((n) => `warning: ${n}`),
          ...warnings.map((w) => `warning: ${w}`),
          ...sayWarnings(doc, taste, timeline).map((w) => `warning: ${w}`),
          ...missing.map((m) => `warning: camera source not readable — ${m}`),
        ].join('\n')));
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_still', {
    title: 'Render one frame and return the image',
    description:
      'Render a single frame and return it as a PNG you can actually look at. This is the '
      + 'feedback loop: after writing or changing a script, render a frame and check it reads. '
      + 'Far cheaper than a full render.',
    inputSchema: {
      ...scriptInput,
      at: z.number().optional().describe('time in seconds (default 0)'),
      frame: z.number().int().optional().describe('frame index, instead of `at`'),
      noCamera: z.boolean().optional().describe('draw camera placeholders instead of decoding footage'),
      savePath: z.string().optional().describe('also write the PNG here'),
    },
  }, async (a: any) => {
    try {
      return await withScript(a, async (file) => {
        const { doc, taste, grid, clips } = await prepare({ ...a, file });
        const film = await Film.create({
          doc, taste, grid, clips, hud: false, noCamera: a.noCamera ?? false,
        });
        try {
          const n = a.frame ?? Math.round((a.at ?? 0) * doc.canvas.fps);
          if (n < 0 || n >= film.frameCount) {
            throw new Error(`frame ${n} is outside 0..${film.frameCount - 1} (${fmtT(film.duration)})`);
          }
          const png = await film.framePng(n);
          if (a.savePath) {
            await mkdir(dirname(resolve(a.savePath)), { recursive: true });
            await Bun.write(resolve(a.savePath), png);
          }
          const hit = film.timeline.at(n / doc.canvas.fps)!;
          return ok(
            text(`frame ${n} (${(n / doc.canvas.fps).toFixed(2)}s) · scene ${hit.cue.index} "${hit.cue.block}"`
              + `${a.savePath ? ` · written to ${resolve(a.savePath)}` : ''}`),
            { type: 'image', data: png.toString('base64'), mimeType: 'image/png' },
          );
        } finally { await film.close(); }
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_render', {
    title: 'Render the video to MP4',
    description:
      'Render the whole film. This is the slow one — minutes, not seconds. Plan first, check a '
      + 'still first, and prefer draft:true while iterating.',
    inputSchema: {
      ...scriptInput,
      out: z.string().describe('output .mp4 path'),
      draft: z.boolean().optional().describe('fast, lower quality (default true here)'),
      noCamera: z.boolean().optional(),
      maxSeconds: z.number().optional().describe('refuse to render longer than this (default 600)'),
    },
  }, async (a: any) => {
    try {
      return await withScript(a, async (file) => {
        const { doc, taste, grid, clips } = await prepare({ ...a, file });
        const { timeline } = plan(doc, taste, grid, clips);
        const cap = a.maxSeconds ?? 600;
        if (timeline.duration > cap) {
          throw new Error(
            `this film is ${fmtT(timeline.duration)}, over the ${fmtT(cap)} guard. `
            + 'Raise maxSeconds deliberately, or render it from the CLI where you can watch progress.',
          );
        }
        const draft = a.draft ?? true;
        const out = resolve(a.out);
        await mkdir(dirname(out), { recursive: true });
        const res = await renderVideo({
          doc, taste, grid, clips, out, hud: false,
          noCamera: a.noCamera ?? false,
          crf: draft ? 30 : 20,
          preset: draft ? 'ultrafast' : 'medium',
        });
        const mb = Bun.file(res.file).size / 1e6;
        return ok(text(
          `${res.file}\n${fmtT(res.duration)} · ${res.frames} frames · ${mb.toFixed(1)} MB\n`
          + `rendered in ${fmtT(res.seconds)} on ${res.workers} workers${draft ? ' (draft quality)' : ''}`,
        ));
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_takes', {
    title: 'Inspect camera takes',
    description:
      'Report every recorded take a script references: resolution, frame rate, length, whether it '
      + 'carries audio, and which scenes read from it. Warns when a take is too short, too small, '
      + 'or too slow for the canvas.',
    inputSchema: scriptInput,
  }, async (a: any) => {
    try {
      return await withScript(a, async (file) => {
        const { doc, taste, grid, clips, info, missing } = await prepare({ ...a, file });
        const { timeline } = plan(doc, taste, grid, clips);
        if (!info.length && !missing.length) {
          return ok(text('no camera takes in this script — add `camera: { src: ... }` to a scene'));
        }
        const lines: string[] = [];
        for (const i of info) {
          const used = doc.scenes
            .map((s, idx) => ({ s, cue: timeline.cues[idx]! }))
            .filter((x) => x.s.camera?.src === i.src);
          lines.push(`${basename(i.src)}  ${i.width}x${i.height} · ${i.fps.toFixed(2)}fps · `
            + `${fmtT(i.duration)} · ${i.hasAudio ? 'has audio' : 'NO AUDIO TRACK'}`);
          let needed = 0;
          for (const u of used) {
            const from = toSeconds(u.s.camera!.from, grid);
            needed = Math.max(needed, from + u.cue.dur);
            lines.push(`   scene ${String(u.cue.index).padStart(2)}  ${u.s.camera!.layout.padEnd(5)} `
              + `${fmtT(u.cue.start)}→${fmtT(u.cue.end)}  reading from ${fmtT(from)}`);
          }
          if (needed > i.duration + 0.05) {
            lines.push(`   warning: short by ${fmtT(needed - i.duration)} — the last frame will hold`);
          }
          if (i.fps < doc.canvas.fps - 0.5) {
            lines.push(`   warning: ${i.fps.toFixed(2)}fps into a ${doc.canvas.fps}fps canvas — frames duplicate`);
          }
        }
        for (const m of missing) lines.push(`missing: ${m}`);
        if (missing.length) lines.push('', 'scripts still plan and preview without footage — render with noCamera:true');
        return ok(text(lines.join('\n')));
      });
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_beats', {
    title: 'Analyse a music track',
    description:
      'Detect tempo, first downbeat, bar length and loudness. Scene ends snap to this grid, so it '
      + 'is worth checking the confidence before committing to a track.',
    inputSchema: { path: z.string().describe('audio file'), bpm: z.number().optional().describe('force a tempo') },
  }, async (a: any) => {
    try {
      const f = resolve(a.path);
      const b = await analyzeBeats(f, { bpm: a.bpm });
      const l = await measureLoudness(f).catch(() => null);
      return ok(text([
        basename(f),
        `tempo     ${b.bpm.toFixed(1)} BPM (confidence ${(b.confidence * 100).toFixed(0)}%)`,
        `downbeat  ${b.offset.toFixed(3)}s`,
        `bar       ${((60 / b.bpm) * b.beatsPerBar).toFixed(3)}s (${b.beatsPerBar} beats)`,
        `duration  ${fmtT(b.duration)}`,
        `onsets    ${b.onsets?.length ?? 0}`,
        l ? `loudness  ${l.lufs.toFixed(1)} LUFS · true peak ${l.peak.toFixed(1)} dBTP` : '',
        '',
        `use in a document:  audio: { music: "${basename(f)}", bpm: ${b.bpm.toFixed(1)} }`,
      ].filter(Boolean).join('\n')));
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_tastes', {
    title: 'List built-in taste profiles',
    description: 'The profiles available by name, with their motion personality and palette.',
    inputSchema: {},
  }, async () => {
    const rows = Object.entries(THEMES).map(([id, t]) =>
      `${id.padEnd(10)} ${t.name.padEnd(12)} ${t.motion.personality} · cuts on ${t.pacing.cutOn}\n`
      + `${' '.repeat(11)}${Object.entries(t.palette).map(([k, v]) => `${k}:${v}`).join(' ')}`);
    return ok(text(rows.join('\n\n')));
  });

  server.registerTool('stingo_derive_taste', {
    title: 'Derive a taste profile from one colour',
    description:
      'Build a complete profile from a single brand hex: neutrals placed on a measured lightness '
      + 'ramp with a trace of the hue, a support colour by rotation, and any value failing the '
      + 'contrast floors lifted until it passes. Returns the JSON.',
    inputSchema: {
      brand: z.string().describe('brand colour, e.g. "#ff7a18"'),
      name: z.string().optional(),
      mode: z.enum(['dark', 'light']).optional(),
      mood: z.enum(['snappy', 'smooth', 'bouncy', 'mechanical']).optional(),
      density: z.enum(['tight', 'normal', 'airy']).optional(),
      texture: z.enum(['clean', 'film', 'crt', 'flat']).optional(),
      cutOn: z.enum(['free', 'beat', 'bar']).optional(),
      support: z.string().optional().describe('second hue, instead of deriving one'),
      savePath: z.string().optional().describe('write the profile here as JSON'),
    },
  }, async (a: any) => {
    try {
      const name = a.name ?? 'Custom';
      const { taste, notes } = derive({
        id: name.toLowerCase().replace(/\s+/g, '-'), name, brand: a.brand,
        support: a.support, mode: a.mode ?? 'dark', mood: a.mood ?? 'snappy',
        density: a.density ?? 'normal', texture: a.texture ?? 'film', cutOn: a.cutOn ?? 'bar',
      });
      const INK = new Set(['text', 'muted', 'accent', 'accent2', 'warn', 'danger', 'ok']);
      const ratios = Object.entries(taste.palette).map(([k, v]) =>
        INK.has(k) ? `${k.padEnd(11)} ${v}  ${contrast(v, taste.palette.bg).toFixed(1)}:1` : `${k.padEnd(11)} ${v}`);
      if (a.savePath) {
        await mkdir(dirname(resolve(a.savePath)), { recursive: true });
        await Bun.write(resolve(a.savePath), JSON.stringify(taste, null, 2));
      }
      return ok(text([
        `${taste.name} — derived from ${a.brand}`,
        ...ratios,
        '',
        ...notes.map((n) => `adjusted: ${n}`),
        a.savePath ? `written to ${resolve(a.savePath)}` : '',
        '',
        JSON.stringify(taste, null, 2),
      ].filter(Boolean).join('\n')));
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_blocks', {
    title: 'List scene types',
    description:
      'The registered block names, and the reference page describing what each one takes, with '
      + 'examples. Read this before writing a script.',
    inputSchema: { block: z.string().optional().describe('only the section for this block') },
  }, async (a: any) => {
    try {
      const names = Object.keys(BLOCKS).sort();
      if (a.block && !names.includes(a.block)) {
        throw new Error(`"${a.block}" is not a block — registered: ${names.join(', ')}`);
      }
      const page = await docPage('blocks');
      // if the reference happens to carry a section for this block, return just
      // that; otherwise the whole page, rather than nothing. The docs are
      // written by hand and their headings are not a contract.
      const section = a.block
        ? page.split(/^## /m).find((sec) => sec.toLowerCase().startsWith(a.block.toLowerCase()))
        : undefined;
      return ok(text([
        `blocks: ${names.join(', ')}`,
        'Every scene also accepts: id, dur, at, say, bg, enter, exit, camera, cut, note.',
        '',
        section ? `## ${section.trim()}` : page,
      ].join('\n')));
    } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_docs', {
    title: 'Read the stingo documentation',
    description:
      'Fetch a documentation page as markdown. Call this when you are unsure how a field behaves '
      + 'rather than guessing — the pages are the same source the website is built from.',
    inputSchema: {
      page: z.enum(['start', 'script', 'blocks', 'taste', 'camera', 'cli', 'internals'])
        .describe('start: install and first render · script: document fields · blocks: scene types · '
          + 'taste: palette, motion, pacing · camera: talking head · cli: commands · internals: how it works'),
    },
  }, async (a: any) => {
    try { return ok(text(await docPage(a.page))); } catch (e) { return fail(e); }
  });

  server.registerTool('stingo_audit_taste', {
    title: 'Audit a taste profile for readability',
    description:
      'Check a profile against the house contrast floors (body 7:1, muted and accents 4.5:1) and '
      + 'report what fails and what stingo repairs automatically at render time.',
    inputSchema: { taste: z.string().describe('built-in name or path to a taste file') },
  }, async (a: any) => {
    try {
      const t = await loadTaste(a.taste, '.');
      const issues = audit(t);
      return ok(text([
        `${t.name} (${t.id})`,
        ...(issues.length
          ? issues.map((i) => `${i.level}: ${i.field} — ${i.message}${i.fix ? ` (suggested ${i.fix})` : ''}`)
          : ['clean — every colour clears the house contrast floors']),
        '',
        `floors: body ${HOUSE.contrast.body}:1 · muted ${HOUSE.contrast.muted}:1 · accents ${HOUSE.contrast.accent}:1`,
      ].join('\n')));
    } catch (e) { return fail(e); }
  });

  return server;
}

export async function main() {
  const server = createServer();
  await server.connect(new StdioServerTransport());
  console.error(`stingo mcp ${VERSION} ready on stdio`);
}
