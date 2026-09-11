import { parse as parseYaml } from 'yaml';
import { extname, resolve, dirname, join, isAbsolute } from 'node:path';
import { parseVideo, TasteProfile, type VideoDoc, type TasteProfile as TP } from '@stingo/schema';
import { THEMES } from '@stingo/themes';

/** Load a video document from .json, .yaml, .yml — or a .ts/.js module that
 *  default-exports a film. The module form is the code-first path: you get
 *  types, loops and real composition instead of hand-written YAML. */
export async function loadDoc(file: string): Promise<VideoDoc> {
  const ext = extname(file).toLowerCase();
  let data: unknown;

  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs') {
    const mod = await import(resolve(file));
    const exported = mod.default ?? mod.film ?? mod.video;
    if (!exported) {
      throw new Error(`${file} has no default export — a film module must \`export default film(...)\``);
    }
    // a FilmBuilder exposes toDoc(); a plain object is already a document
    data = typeof (exported as any).toDoc === 'function' ? (exported as any).toDoc() : exported;
  } else {
    const raw = await Bun.file(file).text();
    data = ext === '.json' ? JSON.parse(raw) : parseYaml(raw);
  }

  const doc = parseVideo(data);
  // resolve every asset path before anything is serialised out to a render
  // worker, which runs with a different working directory
  const base = dirname(resolve(file));
  for (const scene of doc.scenes) {
    if (scene.block === 'code' && scene.file && !scene.code) {
      scene.code = await Bun.file(join(base, scene.file)).text();
    }
    if (scene.camera) scene.camera.src = await assetPath(scene.camera.src, base, 'camera source');
  }
  if (doc.audio.music) doc.audio.music = await assetPath(doc.audio.music, base, 'music');
  if (doc.audio.vo) doc.audio.vo = await assetPath(doc.audio.vo, base, 'voiceover');
  return doc;
}

/** Resolve an asset referenced by a document.
 *
 *  Next to the document is the obvious reading and wins; a path relative to the
 *  working directory also works, because that is how these scripts were written
 *  before documents could live in their own folder. Anything unresolved is
 *  returned as given, so the caller reports a missing file in its own terms —
 *  a script whose footage is not shot yet must still plan and preview. */
async function assetPath(ref: string, base: string, what: string): Promise<string> {
  if (isAbsolute(ref)) return ref;
  for (const c of [resolve(base, ref), resolve(ref)]) {
    if (await Bun.file(c).exists()) return c;
  }
  void what;
  return resolve(base, ref);
}

/** Resolve a taste reference: a built-in theme name, or a path to a taste.json. */
export async function loadTaste(ref: string | TP, dir = '.'): Promise<TP> {
  if (typeof ref !== 'string') return TasteProfile.parse(ref);
  if (ref in THEMES) return THEMES[ref as keyof typeof THEMES];
  const candidates = [ref, join(dir, ref), join(dir, `${ref}.taste.json`), join(dir, 'tastes', `${ref}.json`)];
  for (const c of candidates) {
    if (await Bun.file(c).exists()) {
      const raw = await Bun.file(c).text();
      return TasteProfile.parse(extname(c) === '.json' ? JSON.parse(raw) : parseYaml(raw));
    }
  }
  throw new Error(`unknown taste "${ref}" — built-ins are ${Object.keys(THEMES).join(', ')}, or give a path to a taste file`);
}
