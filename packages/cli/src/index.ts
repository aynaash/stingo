#!/usr/bin/env bun
import { parseArgs, num, str } from './args';
import { loadDoc, loadTaste } from './load';
import { Film, renderVideo, plan, probeClips, cameraAudioCuts, checkTextFits, captionCues, toSrt, toVtt } from '@stingo/film';
import { analyzeBeats, mixAudio, measureLoudness } from '@stingo/audio';
import { THEMES, derive, audit, repair, contrast, HOUSE } from '@stingo/themes';
import { CANVAS_PRESETS, TasteProfile, allBlocks, blockNames } from '@stingo/schema';
import '@stingo/blocks';   // registering the built-in block set
import { DEFAULT_GRID, toSeconds, type BeatGrid } from '@stingo/core';
import { dirname, join, resolve, basename, extname } from 'node:path';
import { mkdir } from 'node:fs/promises';

const C = { dim: '\x1b[2m', b: '\x1b[1m', p: '\x1b[35m', t: '\x1b[36m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', x: '\x1b[0m' };
const log = (s = '') => console.log(s);
const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function bar(done: number, total: number, width = 28) {
  const p = total ? done / total : 0;
  const n = Math.round(p * width);
  return `${C.p}${'█'.repeat(n)}${C.dim}${'░'.repeat(width - n)}${C.x} ${String(Math.round(p * 100)).padStart(3)}%`;
}

async function resolveGrid(doc: any, flags: Record<string, any>): Promise<BeatGrid> {
  const music = str(flags.music, doc.audio?.music ?? '');
  const bpmFlag = flags.bpm ? Number(flags.bpm) : undefined;
  if (!music) return bpmFlag ? { ...DEFAULT_GRID, bpm: bpmFlag } : DEFAULT_GRID;
  const declared = doc.audio?.bpm;
  const a = await analyzeBeats(music, { bpm: bpmFlag ?? (typeof declared === 'number' ? declared : undefined) });
  return { bpm: a.bpm, offset: a.offset, beatsPerBar: a.beatsPerBar, onsets: a.onsets };
}

const HELP = `
${C.b}${C.p}stingo${C.x} ${C.dim}— declarative video for people who ship content${C.x}

${C.b}USAGE${C.x}
  stingo <command> [options]

${C.b}COMMANDS${C.x}
  ${C.t}render${C.x} <doc>        render a video document to MP4
  ${C.t}still${C.x}  <doc>        render a single frame to PNG
  ${C.t}plan${C.x}   <doc>        print the resolved timeline, render nothing
  ${C.t}beats${C.x}  <audio>      analyse tempo, downbeat and onsets
  ${C.t}blocks${C.x}              list registered blocks and their fields
  ${C.t}tastes${C.x}              list built-in taste profiles
  ${C.t}taste${C.x}  <brand-hex>   derive a full taste profile from one colour
  ${C.t}doctor${C.x} <taste>       audit a taste profile against the house floors
  ${C.t}preview${C.x} <doc>       serve a live scrubbing preview
  ${C.t}takes${C.x}  <doc>        inspect the camera takes a script references

${C.b}OPTIONS${C.x}
  -o, --out <file>      output path
  --taste <name|path>   taste profile (default: from doc, else bootdev)
  --vertical            force 1080x1920      --horizontal   force 1920x1080
  --square              force 1080x1080      --fps <n>      override frame rate
  --music <file>        music bed (also sets the beat grid)
  --bpm <n>             force tempo instead of detecting it
  --workers <n>         parallel render processes (default: cpu count)
  --frame <n>           which frame, for \`still\`
  --at <seconds>        which time, for \`still\`
  --crf <n>             quality, lower is better (default 20)
  --preset <name>       x264 preset (default medium)
  --draft               fast, lower quality pass for iterating
  --no-camera           draw camera placeholders instead of decoding footage
  --no-hud              hide the progress bar and scene counter
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
      const taste = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const grid = await resolveGrid(doc, flags);
      const music = str(flags.music, doc.audio.music ?? '');
      const out = resolve(str(flags.out ?? flags.o, join('out', `${basename(file, extname(file))}.mp4`)));
      await mkdir(dirname(out), { recursive: true });

      const { clips, info, missing } = await probeClips(doc);
      const { timeline, warnings } = plan(doc, taste, grid, clips);
      log(`${C.b}${C.p}stingo${C.x} ${doc.title}`);
      log(`${C.dim}  ${doc.canvas.width}x${doc.canvas.height} @ ${doc.canvas.fps}fps · ${doc.scenes.length} scenes · ${fmtT(timeline.duration)} · taste "${taste.name}"${C.x}`);
      if (music) log(`${C.dim}  music ${basename(music)} · ${grid.bpm} BPM · cuts on ${taste.pacing.cutOn}${C.x}`);
      if (info.length) log(`${C.dim}  camera ${info.length} take${info.length > 1 ? 's' : ''} · ${info.map((i) => `${basename(i.src)} ${fmtT(i.duration)}`).join(' · ')}${C.x}`);
      for (const m of missing) log(`${C.y}  warning: camera source not readable, rendering a placeholder — ${m}${C.x}`);
      for (const w of warnings) log(`${C.y}  warning: ${w}${C.x}`);
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
      break;
    }

    case 'still': {
      const file = positional[0];
      if (!file) throw new Error('still: give a video document');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const taste = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const grid = await resolveGrid(doc, flags);
      const { clips } = await probeClips(doc);
      const film = await Film.create({ doc, taste, grid, hud: !flags['no-hud'], clips, noCamera: !!flags['no-camera'] });
      const frame = flags.at != null ? Math.round(num(flags.at, 0) * doc.canvas.fps) : num(flags.frame, 0);
      if (frame >= film.frameCount) throw new Error(`frame ${frame} is past the end (${film.frameCount} frames, ${fmtT(film.duration)})`);
      const out = resolve(str(flags.out ?? flags.o, `still-${frame}.png`));
      await mkdir(dirname(out), { recursive: true });
      await Bun.write(out, await film.framePng(frame));
      await film.close();
      const hit = film.timeline.at(frame / doc.canvas.fps)!;
      log(`${C.g}✓${C.x} ${out} ${C.dim}— frame ${frame} (${(frame / doc.canvas.fps).toFixed(2)}s) · scene ${hit.cue.index} "${hit.cue.block}"${C.x}`);
      break;
    }

    case 'plan': {
      const file = positional[0];
      if (!file) throw new Error('plan: give a video document');
      const doc = await loadDoc(file);
      applyCanvasFlags(doc);
      const taste = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const grid = await resolveGrid(doc, flags);
      const { clips, missing } = await probeClips(doc);
      const { timeline, warnings } = plan(doc, taste, grid, clips);
      log(`${C.b}${doc.title}${C.x} ${C.dim}· ${doc.canvas.width}x${doc.canvas.height}@${doc.canvas.fps} · taste "${taste.name}" · ${grid.bpm} BPM · cuts on ${taste.pacing.cutOn}${C.x}`);
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
      for (const m of missing) log(`${C.y}  warning: camera source not readable — ${m}${C.x}`);
      for (const w of warnings) log(`${C.y}  warning: ${w}${C.x}`);
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
      if (!ref) throw new Error('doctor: give a taste name or path');
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
      const taste = await loadTaste(str(flags.taste, '') || doc.taste, dirname(resolve(file)));
      const grid = await resolveGrid(doc, flags);
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

    case 'help': default:
      log(HELP);
  }
} catch (e: any) {
  log(`${C.r}✗ ${e.message}${C.x}`);
  if (flags.debug) console.error(e);
  process.exit(1);
}
