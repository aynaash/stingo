#!/usr/bin/env bun
import { parseArgs, num, str } from './args';
import { loadDoc, loadTaste } from './load';
import { doctorDoc, looksLikeDoc } from './doctor';
import { Film, renderVideo, plan, probeClips, cameraAudioCuts, checkTextFits, captionCues, toSrt, toVtt,
         sayWarnings, takeBudget, contactSheet, guidesSvg } from '@stingo/film';
import { analyzeBeats, mixAudio, measureLoudness, verifyMix } from '@stingo/audio';
import { THEMES, derive, audit, repair, contrast, HOUSE } from '@stingo/themes';
import { CANVAS_PRESETS, TasteProfile, allBlocks, blockNames } from '@stingo/schema';
import '@stingo/blocks';   // registering the built-in block set
import { DEFAULT_GRID, toSeconds, type BeatGrid } from '@stingo/core';
import { dirname, join, relative, resolve, basename, extname } from 'node:path';
import { mkdir } from 'node:fs/promises';

const VERSION = '0.1.0';

const C = { dim: '\x1b[2m', b: '\x1b[1m', p: '\x1b[35m', t: '\x1b[36m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const log = (s = '') => console.log(s);
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** loadDoc resolves assets to absolute paths so render workers can find them;
 *  an error message wants the path the author actually typed. */
const rel = (p: string) => {
  const r = relative(process.cwd(), p);
  return !r || r.startsWith('..') ? p : r;
};

/** One glyph per check level, padded so the messages line up. */
const badge = (c: { level: string }) =>
  c.level === 'error' ? `${C.r}✗ error${C.x}` : c.level === 'warn' ? `${C.y}! warn ${C.x}` : `${C.g}✓ ok   ${C.x}`;

function bar(done: number, total: number, width = 28) {
  const p = total ? done / total : 0;
  const n = Math.round(p * width);
  return `${C.p}${'█'.repeat(n)}${C.dim}${'░'.repeat(width - n)}${C.x} ${String(Math.round(p * 100)).padStart(3)}%`;
}

/** The beat grid, the usable music path, and what went wrong getting there.
 *
 *  A missing track used to end the command. It should not: `plan` renders
 *  nothing and decodes nothing, and `still` draws one frame — neither needs
 *  audio, they need a tempo. So a track that is declared and not there is
 *  reported, the music is dropped from everything downstream, and cutting falls
 *  back to free timing, which is the honest answer when there is no grid to
 *  snap to. Snapping to a nominal 120 BPM instead would produce a plan that is
 *  wrong in a way that looks right. */
interface Tempo {
  grid: BeatGrid;
  /** the track, if it can actually be used; '' otherwise */
  music: string;
  /** true when cuts must not be snapped, because no real tempo was found */
  free: boolean;
  warnings: string[];
}

async function resolveTempo(doc: any, flags: Record<string, any>): Promise<Tempo> {
  const declared = str(flags.music, doc.audio?.music ?? '');
  const bpmFlag = flags.bpm ? Number(flags.bpm) : undefined;
  const warnings: string[] = [];
  const nominal = bpmFlag ? { ...DEFAULT_GRID, bpm: bpmFlag } : DEFAULT_GRID;

  // no music declared is not a problem; it is a film cut to its own content
  if (!declared) return { grid: nominal, music: '', free: false, warnings };

  if (!(await Bun.file(declared).exists())) {
    warnings.push(
      `no such file ${rel(declared)} — cutting free and rendering without music. `
      + 'Point `audio.music` at a track, or remove the `audio:` block',
    );
    return { grid: nominal, music: '', free: !bpmFlag, warnings };
  }

  const bpm = bpmFlag ?? (typeof doc.audio?.bpm === 'number' ? doc.audio.bpm : undefined);
  try {
    const a = await analyzeBeats(declared, { bpm });
    return {
      grid: { bpm: a.bpm, offset: a.offset, beatsPerBar: a.beatsPerBar, onsets: a.onsets },
      music: declared, free: false, warnings,
    };
  } catch (e: any) {
    warnings.push(
      `${basename(declared)} could not be decoded — ${String(e.message).split('\n')[0]!.trim()}. `
      + 'Cutting free and rendering without music; check the file plays and that ffmpeg reads the format',
    );
    return { grid: nominal, music: '', free: !bpmFlag, warnings };
  }
}

/** A taste with grid snapping switched off, for planning without a tempo. */
const freeCut = (t: any) => ({ ...t, pacing: { ...t.pacing, cutOn: 'free' } });

const HELP = `
${C.b}${C.p}stingo${C.x} ${C.dim}— declarative video for people who ship content${C.x}

${C.b}USAGE${C.x}
  stingo <command> [options]

${C.b}COMMANDS${C.x}
  ${C.t}render${C.x} <doc>        render a video document to MP4
  ${C.t}still${C.x}  <doc>        render a single frame to PNG
  ${C.t}sheet${C.x}  <doc>        contact sheet — one still per scene, in a grid
  ${C.t}plan${C.x}   <doc>        print the resolved timeline, render nothing
  ${C.t}doctor${C.x} <doc|taste>  check everything a render needs, in one pass
  ${C.t}beats${C.x}  <audio>      analyse tempo, downbeat and onsets
  ${C.t}blocks${C.x}              list registered blocks and their fields
  ${C.t}tastes${C.x}              list built-in taste profiles
  ${C.t}taste${C.x}  <brand-hex>   derive a full taste profile from one colour
  ${C.t}preview${C.x} <doc>       serve a live scrubbing preview
  ${C.t}takes${C.x}  <doc>        inspect the camera takes a script references
  ${C.t}version${C.x}             print the version and exit

${C.b}OPTIONS${C.x}
  -o, --out <file>      output path
  --taste <name|path>   taste profile (default: from doc, else bootdev)
  --vertical            force 1080x1920      --horizontal   force 1920x1080
  --square              force 1080x1080      --fps <n>      override frame rate
  --music <file>        music bed (also sets the beat grid)
  --bpm <n>             force tempo instead of detecting it
  --workers <n>         parallel render processes (default: cpu count)
  --frame <n>           which frame, for \`still\`
  --at <seconds>        which time, for \`still\` (a 0..1 fraction for \`sheet\`)
  --guides              overlay title-safe and platform UI zones, for \`still\`
  --width <n>           sheet width in pixels (default 2000)
  --cols <n>            sheet columns (default: chosen from the scene count)
  --crf <n>             quality, lower is better (default 20)
  --preset <name>       x264 preset (default medium)
  --draft               fast, lower quality pass for iterating
  --no-camera           draw camera placeholders instead of decoding footage
  --no-hud              hide the progress bar and scene counter
  --no-verify           skip measuring the finished mix
  --debug               print a stack trace on failure
  --port <n>            preview server port (default 4321)

${C.b}TASTE OPTIONS${C.x} ${C.dim}(for \`taste\`)${C.x}
  --mode dark|light     --mood snappy|smooth|bouncy|mechanical
  --density tight|normal|airy    --texture clean|film|crt|flat
  --support <hex>       second hue (default: derived by rotation)
  --cut bar|beat|free   --name <label>   --save <file>
`;

const argv = process.argv.slice(2);
const { cmd, positional, flags } = parseArgs(argv);

function applyCanvasFlags(doc: any) {
  if (flags.vertical) Object.assign(doc.canvas, CANVAS_PRESETS.vertical);
  if (flags.horizontal) Object.assign(doc.canvas, CANVAS_PRESETS.horizontal);
  if (flags.square) Object.assign(doc.canvas, CANVAS_PRESETS.square);
  if (flags.fps) doc.canvas.fps = num(flags.fps, doc.canvas.fps);
  doc.canvas.orientation = doc.canvas.width > doc.canvas.height ? 'landscape' : doc.canvas.width === doc.canvas.height ? 'square' : 'portrait';
}

try {
  switch (cmd) {
    case 'render': {
      const file = positional[0];
      if (!file) throw new Error('render: give a video document, e.g. `stingo render video.yaml`');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const declared = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const tempo = await resolveTempo(doc, flags);
      const { grid } = tempo;
      const music = tempo.music;
      const taste = tempo.free ? freeCut(declared) : declared;
      const out = resolve(str(flags.out ?? flags.o, join('out', `${basename(file, extname(file))}.mp4`)));
      await mkdir(dirname(out), { recursive: true });

      const { clips, info, missing } = await probeClips(doc);
      const { timeline, warnings } = plan(doc, taste, grid, clips);
      log(`${C.b}${C.p}stingo${C.x} ${doc.title}`);
      log(`${C.dim}  ${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps · ${doc.scenes.length} scenes · ${fmtT(timeline.duration)} · taste "${taste.name}"${C.x}`);
      if (music) log(`${C.dim}  music ${basename(music)} · ${grid.bpm} BPM · cuts on ${taste.pacing.cutOn}${C.x}`);
      if (info.length) log(`${C.dim}  camera ${info.length} take${info.length > 1 ? 's' : ''} · ${info.map((i) => `${basename(i.src)} ${fmtT(i.duration)}`).join(' · ')}${C.x}`);
      for (const w of tempo.warnings) log(`${C.y}  warning: ${w}${C.x}`);
      for (const m of missing) log(`${C.y}  warning: camera source not readable, rendering a placeholder — ${m}${C.x}`);
      for (const w of warnings) log(`${C.y}  warning: ${w}${C.x}`);
      for (const w of sayWarnings(doc, taste, timeline)) log(`${C.y}  warning: ${w}${C.x}`);
      for (const w of await checkTextFits(doc, taste)) log(`${C.y}  warning: ${w}${C.x}`);
      log();

      const noCamera = !!flags['no-camera'];
      const hasAudio = new Map(info.map((i) => [i.src, i.hasAudio] as const));
      const camCuts = noCamera ? [] : cameraAudioCuts(doc, timeline, (src) => hasAudio.get(src) ?? false)
        .map((c) => ({ ...c, from: typeof c.from === 'number' ? c.from : 0 }));

      let audioFile: string | undefined;
      if (music || doc.audio.vo || camCuts.length) {
        const tmp = join('.stingo', `audio-${Date.now()}.m4a`);
        await mkdir('.stingo', { recursive: true });
        process.stdout.write(`${C.dim}  mixing audio…${C.x}\r`);
        audioFile = (await mixAudio({
          music: music || undefined, vo: doc.audio.vo, clips: camCuts, out: tmp, duration: timeline.duration,
          musicGainDb: doc.audio.musicGainDb, duckDb: taste.music.duckDb, targetLufs: taste.music.targetLufs,
        })) ?? undefined;
        log(`${C.g}  ✓${C.x} audio mixed${' '.repeat(20)}`);
      }

      const draft = !!flags.draft;
      const t0 = Date.now();
      const res = await renderVideo({
        doc, taste, grid, out, clips, noCamera,
        workers: flags.workers ? num(flags.workers, 0) || undefined : undefined,
        crf: num(flags.crf, draft ? 30 : 20),
        preset: str(flags.preset, draft ? 'ultrafast' : 'medium'),
        hud: !flags['no-hud'],
        audio: audioFile,
        onProgress: (d, t) => {
          const el = (Date.now() - t0) / 1000;
          const eta = d ? (el / d) * (t - d) : 0;
          process.stdout.write(`  ${bar(d, t)} ${C.dim}${d}/${t} frames · eta ${fmtT(eta)}${C.x}   \r`);
        },
      });
      // A sidecar goes out whenever captions are on, burned in or not: every
      // platform takes an upload track, and a burned-in caption is invisible to
      // search. Costs nothing to write.
      let sidecars: string[] = [];
      if (doc.captions?.enabled) {
        const cues = captionCues(doc, timeline, taste);
        if (cues.length) {
          const stem = out.replace(/\.mp4$/, '');
          await Bun.write(`${stem}.srt`, toSrt(cues));
          await Bun.write(`${stem}.vtt`, toVtt(cues));
          sidecars = [`${stem}.srt`, `${stem}.vtt`];
        } else {
          log(`${C.y}  warning: captions are enabled but no scene has a \`say\` field${C.x}`);
        }
      }

      const size = (await Bun.file(res.file).size) / 1e6;
      log(`  ${bar(res.frames, res.frames)} ${C.dim}${res.frames}/${res.frames} frames${C.x}      `);
      log();
      log(`${C.g}${C.b}  ✓ ${res.file}${C.x}`);
      log(`${C.dim}    ${fmtT(res.duration)} · ${size.toFixed(1)} MB · rendered in ${fmtT(res.seconds)} on ${res.workers} workers · ${(res.duration / res.seconds).toFixed(2)}x realtime${C.x}`);
      for (const f of sidecars) log(`${C.g}  ✓${C.x} ${f}`);

      // Bad audio is what loses viewers, and it is the one fault a still cannot
      // show you. Measuring it costs two passes over the audio, against minutes
      // of rendering, so it is not optional — only --no-verify skips it.
      //
      // The finished MP4 is measured rather than the pre-encode stem, because
      // AAC overshoots: the same mix reads -1.1 dBTP before encoding and -0.9
      // after, and it is the shipped number that clips.
      if (audioFile && !flags['no-verify']) {
        const mix = await verifyMix({
          file: res.file, targetLufs: taste.music.targetLufs,
          music: music || undefined, musicGainDb: doc.audio.musicGainDb,
          vo: doc.audio.vo, clips: camCuts,
        });
        if (mix) {
          const lead = mix.lead != null ? ` · speech ${mix.lead >= 0 ? '+' : ''}${mix.lead.toFixed(1)} LU over music` : '';
          log(`${C.dim}    audio ${mix.lufs.toFixed(1)} LUFS · true peak ${mix.peak.toFixed(1)} dBTP${lead}${C.x}`);
          for (const n of mix.notes) log(`${C.y}    audio: ${n}${C.x}`);
        }
      }
      break;
    }

    case 'still': {
      const file = positional[0];
      if (!file) throw new Error('still: give a video document');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const declared = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const tempo = await resolveTempo(doc, flags);
      const taste = tempo.free ? freeCut(declared) : declared;
      for (const w of tempo.warnings) log(`${C.y}warning: ${w}${C.x}`);
      const { clips } = await probeClips(doc);
      const film = await Film.create({ doc, taste, grid: tempo.grid, hud: !flags['no-hud'], clips, noCamera: !!flags['no-camera'] });
      const frame = flags.at != null ? Math.round(num(flags.at, 0) * doc.canvas.fps) : num(flags.frame, 0);
      if (frame >= film.frameCount) throw new Error(`frame ${frame} is past the end (${film.frameCount} frames, ${fmtT(film.duration)}) — use --at ${(film.duration * 0.5).toFixed(1)} for the middle`);
      const out = resolve(str(flags.out ?? flags.o, `still-${frame}.png`));
      await mkdir(dirname(out), { recursive: true });
      const guides = !!flags.guides;
      await Bun.write(out, guides
        ? await film.framePngOverlaid(frame, guidesSvg(doc, taste))
        : await film.framePng(frame));
      await film.close();
      const hit = film.timeline.at(frame / doc.canvas.fps)!;
      log(`${C.g}✓${C.x} ${out} ${C.dim}— frame ${frame} (${(frame / doc.canvas.fps).toFixed(2)}s) · scene ${hit.cue.index} "${hit.cue.block}"${C.x}`);
      if (guides) {
        log(`${C.dim}  guides: title-safe 90%, action-safe 95%, and the ${doc.canvas.orientation} platform UI zones${C.x}`);
        log(`${C.dim}  anything you need read belongs inside the title-safe box and outside the red zones${C.x}`);
      }
      break;
    }

    case 'sheet': {
      const file = positional[0];
      if (!file) throw new Error('sheet: give a video document, e.g. `stingo sheet video.yaml -o sheet.png`');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const declared = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const tempo = await resolveTempo(doc, flags);
      const taste = tempo.free ? freeCut(declared) : declared;
      for (const w of tempo.warnings) log(`${C.y}warning: ${w}${C.x}`);
      const { clips } = await probeClips(doc);
      const out = resolve(str(flags.out ?? flags.o, join('out', `${basename(file, extname(file))}-sheet.png`)));
      await mkdir(dirname(out), { recursive: true });

      log(`${C.b}${doc.title}${C.x} ${C.dim}· ${doc.scenes.length} scenes${C.x}`);
      const res = await contactSheet({
        doc, taste, grid: tempo.grid, clips, noCamera: !!flags['no-camera'],
        width: num(flags.width, 2000),
        cols: flags.cols ? num(flags.cols, 0) || undefined : undefined,
        at: flags.at != null ? num(flags.at, 0.5) : undefined,
        onFrame: (d, t) => process.stdout.write(`  ${bar(d, t)} ${C.dim}${d}/${t} scenes${C.x}   \r`),
      });
      await Bun.write(out, res.png);
      log(`  ${bar(res.cells, res.cells)} ${C.dim}${res.cells}/${res.cells} scenes${C.x}   `);
      log();
      log(`${C.g}✓${C.x} ${out} ${C.dim}— ${res.cols}×${res.rows} grid, ${res.width}x${res.height}${C.x}`);
      log(`${C.dim}  one frame from the middle of each scene. Look for three dark scenes in a row,${C.x}`);
      log(`${C.dim}  two that say the same thing, and the one that does not belong.${C.x}`);
      break;
    }

    case 'plan': {
      const file = positional[0];
      if (!file) throw new Error('plan: give a video document');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const declared = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const tempo = await resolveTempo(doc, flags);
      const { grid } = tempo;
      const taste = tempo.free ? freeCut(declared) : declared;
      const { clips, missing } = await probeClips(doc);
      const { timeline, warnings } = plan(doc, taste, grid, clips);
      const tempoNote = tempo.music ? `${grid.bpm} BPM` : `${grid.bpm} BPM nominal`;
      log(`${C.b}${doc.title}${C.x} ${C.dim}· ${doc.canvas.width}x${doc.canvas.height}@${doc.canvas.fps} · taste "${taste.name}" · ${tempoNote} · cuts on ${taste.pacing.cutOn}${C.x}`);
      log();
      const beatLen = 60 / grid.bpm;
      for (const c of timeline.cues) {
        const beats = (c.dur / beatLen).toFixed(1);
        const cam = doc.scenes[c.index]?.camera;
        const tag = cam ? ` ${C.p}◉ ${cam.layout}${C.x}` : '';
        log(`  ${C.dim}${String(c.index).padStart(2)}${C.x} ${C.t}${c.block.padEnd(10)}${C.x} ${fmtT(c.start)}→${fmtT(c.end)} ${C.dim}${c.dur.toFixed(2)}s (${beats} beats)${C.x}  ${C.dim}${c.id}${C.x}${tag}`);
      }
      log();
      log(`  ${C.b}total${C.x} ${fmtT(timeline.duration)} · ${timeline.frameCount} frames`);

      // The shooting list. `plan` already knows how long every camera scene is;
      // printing it as one line is what turns that into something you can tape
      // to the wall before you sit down in front of the camera.
      const budget = takeBudget(doc, timeline);
      if (budget.length) {
        const total = budget.reduce((a, b) => a + b.dur, 0);
        log();
        log(`  ${C.b}to camera${C.x} ${C.dim}${budget.length} scene${budget.length > 1 ? 's' : ''} · ${fmtT(total)} of footage${C.x}`);
        log(`  ${budget.map((b) => `${C.t}${b.id}${C.x} ${Math.round(b.dur)}s`).join(` ${C.dim}·${C.x} `)}`);
      }

      for (const w of tempo.warnings) log(`${C.y}  warning: ${w}${C.x}`);
      for (const m of missing) log(`${C.y}  warning: camera source not readable — ${m}${C.x}`);
      for (const w of warnings) log(`${C.y}  warning: ${w}${C.x}`);
      for (const w of sayWarnings(doc, taste, timeline)) log(`${C.y}  warning: ${w}${C.x}`);
      for (const w of await checkTextFits(doc, taste)) log(`${C.y}  warning: ${w}${C.x}`);
      break;
    }

    case 'beats': {
      const file = positional[0];
      if (!file) throw new Error('beats: give an audio file');
      const a = await analyzeBeats(file, { bpm: flags.bpm ? Number(flags.bpm) : undefined });
      log(`${C.b}${basename(file)}${C.x}`);
      log(`  tempo      ${C.p}${a.bpm} BPM${C.x} ${C.dim}(confidence ${(a.confidence * 100).toFixed(0)}%)${C.x}`);
      log(`  downbeat   ${a.offset.toFixed(3)}s`);
      log(`  bar        ${((60 / a.bpm) * a.beatsPerBar).toFixed(3)}s ${C.dim}(${a.beatsPerBar} beats)${C.x}`);
      log(`  duration   ${fmtT(a.duration)}`);
      log(`  onsets     ${a.onsets?.length ?? 0}`);
      const l = await measureLoudness(file);
      if (l) log(`  loudness   ${l.lufs.toFixed(1)} LUFS ${C.dim}· true peak ${l.peak.toFixed(1)} dBTP${C.x}`);
      log();
      log(`${C.dim}  use in a doc:  audio: { music: "${basename(file)}", bpm: ${a.bpm} }${C.x}`);
      break;
    }

    case 'blocks': {
      const defs = allBlocks();
      const want = positional[0];
      log(`${C.b}${defs.length} registered blocks${C.x}`);
      log();
      for (const d of defs) {
        if (want && d.name !== want) continue;
        log(`  ${C.p}${C.b}${d.name}${C.x}${d.describe ? ` ${C.dim}— ${d.describe}${C.x}` : ''}`);
        const fields = Object.entries(d.fields as Record<string, any>);
        for (const [k, v] of fields) {
          // zod keeps the human-readable shape name on the def
          const t = v?._zod?.def?.type ?? 'unknown';
          const optional = v?.safeParse?.(undefined)?.success ? ' ?' : '';
          log(`      ${C.t}${k}${C.x}${optional} ${C.dim}${t}${C.x}`);
        }
        const dur = d.duration;
        log(`      ${C.dim}· ${dur.base}s default${dur.estimate ? ', content-aware' : ''}${dur.exact ? ', exact (skips pacing clamp)' : ''}` +
            `${d.broll ? ` · bg ${d.broll.kind}` : ''}${C.x}`);
        log();
      }
      if (!want) log(`${C.dim}  stingo blocks <name> for one · add your own with defineBlock() in a single file${C.x}`);
      break;
    }

    case 'tastes': {
      log(`${C.b}built-in taste profiles${C.x}`);
      for (const [id, t] of Object.entries(THEMES)) {
        log(`  ${C.p}${id.padEnd(10)}${C.x} ${t.name.padEnd(12)} ${C.dim}${t.motion.personality} · cuts on ${t.pacing.cutOn} · ${t.type.display.family}${C.x}`);
        log(`  ${' '.repeat(10)} ${C.dim}${Object.entries(t.palette).slice(0, 6).map(([k, v]) => `${k}:${v}`).join(' ')}${C.x}`);
      }
      break;
    }

    case 'taste': {
      const brand = positional[0];
      if (!brand) throw new Error('taste: give a brand colour, e.g. `stingo taste "#ff6b35"`');
      const id = str(flags.name, 'custom').toLowerCase().replace(/\s+/g, '-');
      const { taste, notes } = derive({
        id, name: str(flags.name, 'Custom'), brand,
        support: typeof flags.support === 'string' ? flags.support : undefined,
        mode: str(flags.mode, 'dark') as any,
        mood: str(flags.mood, 'snappy') as any,
        density: str(flags.density, 'normal') as any,
        texture: str(flags.texture, 'film') as any,
        cutOn: str(flags.cut, 'bar') as any,
      });
      const p = taste.palette;
      log(`${C.b}${taste.name}${C.x} ${C.dim}derived from ${brand}${C.x}`);
      log();
      // only ink is contrast-checked; bg/surface/border are grounds, and a
      // ratio next to them reads as a failure when it is simply not applicable
      const INK = new Set(['text', 'muted', 'accent', 'accent2', 'warn', 'danger', 'ok']);
      for (const [k, v] of Object.entries(p)) {
        const swatch = `\x1b[48;2;${parseInt(v.slice(1,3),16)};${parseInt(v.slice(3,5),16)};${parseInt(v.slice(5,7),16)}m    \x1b[0m`;
        let flag = `${C.dim}ground${C.x}`;
        if (INK.has(k)) {
          const ratio = contrast(v, p.bg);
          const floor = k === 'text' ? HOUSE.contrast.body : HOUSE.contrast.accent;
          flag = ratio >= floor ? `${C.g}${ratio.toFixed(1)}:1${C.x}` : `${C.y}${ratio.toFixed(1)}:1 (floor ${floor})${C.x}`;
        }
        log(`  ${swatch} ${C.dim}${k.padEnd(11)}${C.x} ${v}  ${flag}`);
      }
      log();
      log(`  ${C.dim}motion${C.x}  ${taste.motion.personality} · ${taste.motion.ease} · stagger ${taste.motion.stagger}s · travel ${taste.motion.travel}px`);
      log(`  ${C.dim}pacing${C.x}  ${taste.pacing.sceneMin}–${taste.pacing.sceneMax}s · cuts on ${taste.pacing.cutOn} · ${taste.pacing.wordsPerMinute} wpm`);
      log(`  ${C.dim}texture${C.x} grain ${taste.texture.grain} · vignette ${taste.texture.vignette} · radius ${taste.texture.cornerRadius}`);
      for (const n of notes) log(`  ${C.y}adjusted${C.x} ${C.dim}${n}${C.x}`);
      if (flags.save) {
        const out = str(flags.save, `${id}.taste.json`);
        await Bun.write(out, JSON.stringify(taste, null, 2));
        log();
        log(`${C.g}✓${C.x} ${out}`);
      } else {
        log();
        log(`${C.dim}  --save <file> to write this out as a taste.json${C.x}`);
      }
      break;
    }

    case 'doctor': {
      const ref = positional[0];
      if (!ref) throw new Error('doctor: give a video document, or a taste name or path');

      // `doctor` answers two different questions, and which one you meant is
      // decided by what you handed it: a document gets the full preflight, a
      // taste gets the contrast audit it has always got.
      if (await looksLikeDoc(ref)) {
        const rep = await doctorDoc(ref, str(flags.taste, ''));
        log(`${C.b}${rep.title}${C.x} ${C.dim}· ${basename(rep.file)}${C.x}`);
        log();
        // a blank line only where a group of several checks ends, so a report
        // that is all one-liners stays one block instead of double-spaced
        const counts = new Map<string, number>();
        for (const c of rep.checks) counts.set(c.area, (counts.get(c.area) ?? 0) + 1);
        let area = '';
        for (const c of rep.checks) {
          if (area && c.area !== area && (counts.get(area)! > 1 || counts.get(c.area)! > 1)) log();
          area = c.area;
          log(`  ${badge(c)} ${C.dim}${c.area.padEnd(9)}${C.x} ${c.message}`);
          if (c.fix) log(`  ${' '.repeat(17)} ${C.dim}→ ${c.fix}${C.x}`);
        }
        const errs = rep.checks.filter((c) => c.level === 'error').length;
        const warns = rep.checks.filter((c) => c.level === 'warn').length;
        log();
        if (!errs && !warns) log(`  ${C.g}✓ ready to render${C.x}`);
        else log(`  ${errs ? `${C.r}${errs} error${errs > 1 ? 's' : ''}${C.x}` : `${C.g}no errors${C.x}`}`
                 + `${warns ? ` ${C.dim}·${C.x} ${C.y}${warns} warning${warns > 1 ? 's' : ''}${C.x}` : ''}`
                 + `${errs ? '' : ` ${C.dim}— warnings do not stop a render${C.x}`}`);
        // a non-zero exit is what makes this usable in a pre-publish script
        if (errs) process.exit(1);
        break;
      }

      const taste = await loadTaste(ref, '.');
      const issues = audit(taste);
      log(`${C.b}${taste.name}${C.x} ${C.dim}(${taste.id})${C.x}`);
      log();
      if (!issues.length) {
        log(`  ${C.g}✓ clean${C.x} ${C.dim}— every colour clears the house contrast floors${C.x}`);
      } else {
        for (const i of issues) {
          const tag = i.level === 'error' ? `${C.r}error${C.x}` : `${C.y}warn ${C.x}`;
          log(`  ${tag} ${C.b}${i.field}${C.x} ${i.message}`);
          if (i.fix) log(`        ${C.dim}suggested: ${i.fix}${C.x}`);
        }
        log();
        const { applied } = repair(taste);
        log(`${C.dim}  ${applied.length} of ${issues.length} fixable automatically — stingo applies these at render time.${C.x}`);
      }
      log();
      log(`${C.dim}  house floors: body ${HOUSE.contrast.body}:1 · muted ${HOUSE.contrast.muted}:1 · accents ${HOUSE.contrast.accent}:1${C.x}`);
      break;
    }

    case 'takes': {
      const file = positional[0];
      if (!file) throw new Error('takes: give a video document');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const declared = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const tempo = await resolveTempo(doc, flags);
      const { grid } = tempo;
      const taste = tempo.free ? freeCut(declared) : declared;
      for (const w of tempo.warnings) log(`${C.y}warning: ${w}${C.x}`);
      const { clips, info, missing } = await probeClips(doc);
      const { timeline } = plan(doc, taste, grid, clips);

      const used = doc.scenes.map((sc, i) => ({ sc, cue: timeline.cues[i]! })).filter((x) => x.sc.camera);
      if (!used.length && !missing.length) {
        log(`${C.dim}no camera takes in ${basename(file)} — add \`camera: { src: ... }\` to a scene${C.x}`);
        break;
      }

      log(`${C.b}${doc.title}${C.x} ${C.dim}· ${doc.canvas.width}x${doc.canvas.height}@${doc.canvas.fps}${C.x}`);
      log();
      for (const i of info) {
        const scenes = used.filter((u) => u.sc.camera!.src === i.src);
        const needed = scenes.reduce((a, u) => Math.max(a, toSeconds(u.sc.camera!.from, grid) + u.cue.dur), 0);
        log(`  ${C.t}${basename(i.src)}${C.x} ${C.dim}${i.width}x${i.height} · ${i.fps.toFixed(2)}fps · ${fmtT(i.duration)} · ${i.hasAudio ? 'has audio' : `${C.y}no audio track${C.dim}`}${C.x}`);
        for (const u of scenes) {
          const cam = u.sc.camera!;
          log(`    ${C.dim}scene ${String(u.cue.index).padStart(2)}${C.x} ${cam.layout.padEnd(5)} ${C.dim}${fmtT(u.cue.start)}→${fmtT(u.cue.end)} reading from ${fmtT(toSeconds(cam.from, grid))}${C.x}`);
        }
        // a take shorter than the scenes reading from it freezes on its last frame
        if (needed > i.duration + 0.05) log(`    ${C.y}short by ${fmtT(needed - i.duration)} — the last frame will hold${C.x}`);
        if (i.fps < doc.canvas.fps - 0.5) log(`    ${C.y}shot at ${i.fps.toFixed(2)}fps into a ${doc.canvas.fps}fps canvas — frames will be duplicated${C.x}`);
        const short = Math.min(i.width, i.height);
        const needShort = Math.max(...scenes.map((u) => {
          const cam = u.sc.camera!;
          return cam.layout === 'full' ? Math.min(doc.canvas.width, doc.canvas.height)
            : cam.layout === 'split' ? Math.round(Math.min(doc.canvas.width, doc.canvas.height) * cam.ratio)
            : Math.round(doc.canvas.width * cam.size);
        }));
        if (short < needShort) log(`    ${C.y}${short}px short edge feeding a ${needShort}px box — it will be upscaled${C.x}`);
        log();
      }
      for (const m of missing) log(`  ${C.r}missing${C.x} ${m}`);
      if (missing.length) {
        log();
        log(`${C.dim}  scripts still plan and preview without footage — render with --no-camera${C.x}`);
      }
      break;
    }

    case 'preview': {
      const file = positional[0];
      if (!file) throw new Error('preview: give a video document');
      const { serve } = await import('@stingo/studio');
      await serve({ file, port: num(flags.port, 4321), taste: str(flags.taste, ''), flags });
      break;
    }

    case 'version': case '--version': case '-v':
      log(VERSION);
      break;

    case 'help':
      log(HELP);
      break;

    default:
      // exiting 0 on an unknown command means a typo passes silently in CI
      log(HELP);
      log(`${C.r}✗ unknown command "${cmd}"${C.x}`);
      process.exit(1);
  }
} catch (e: any) {
  log(`${C.r}✗ ${e.message}${C.x}`);
  if (flags.debug) console.error(e);
  process.exit(1);
}
