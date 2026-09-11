#!/usr/bin/env bun
/** Tiny local player for rendered output. Serves out/ with HTTP range support
 *  (browsers need 206 responses to scrub a video) and a page that lists
 *  whatever has finished rendering so far. */
import { readdir, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const ROOT = 'out';
const PORT = Number(process.env.PORT ?? 8787);
const TYPES: Record<string, string> = { '.mp4': 'video/mp4', '.png': 'image/png', '.jpg': 'image/jpeg', '.webm': 'video/webm' };

async function listVideos(): Promise<{ path: string; size: number; label: string }[]> {
  const out: { path: string; size: number; label: string }[] = [];
  async function walk(dir: string, prefix = '') {
    let entries: string[] = [];
    try { entries = await readdir(dir); } catch { return; }
    for (const e of entries) {
      if (e.startsWith('.')) continue;
      const full = join(dir, e);
      const s = await stat(full);
      if (s.isDirectory()) await walk(full, `${prefix}${e}/`);
      else if (extname(e) === '.mp4') out.push({ path: `${prefix}${e}`, size: s.size, label: e.replace(/\.mp4$/, '') });
    }
  }
  await walk(ROOT);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

const html = (vids: { path: string; size: number; label: string }[]) => `<!doctype html>
<html><head><meta charset="utf-8"><title>stingo — output</title>
<style>
 :root{--bg:#0b0a14;--surface:#15132a;--border:#2e2a52;--text:#f4f2ff;--muted:#8a85ab;--accent:#a78bfa;--accent2:#2dd4bf}
 *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--text);
   font:14px/1.6 ui-monospace,"JetBrains Mono",Menlo,monospace}
 header{padding:18px 24px;border-bottom:1px solid var(--border);background:var(--surface);
   display:flex;gap:14px;align-items:baseline;flex-wrap:wrap}
 h1{margin:0;font-size:16px;font-weight:800;letter-spacing:-.02em}
 h1 span{color:var(--accent)}
 .dim{color:var(--muted);font-size:12px}
 main{padding:24px;display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start}
 .card{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden;
   display:flex;flex-direction:column;max-width:100%}
 .card h2{margin:0;padding:12px 16px;font-size:13px;font-weight:700;border-bottom:1px solid var(--border);
   display:flex;gap:10px;align-items:center;justify-content:space-between}
 .card h2 em{font-style:normal;color:var(--muted);font-weight:400;font-size:11px}
 video{display:block;background:#000;max-height:78vh;max-width:100%}
 .v video{width:340px} .h video{width:760px}
 a{color:var(--accent2)}
 .empty{padding:40px;color:var(--muted)}
 footer{padding:16px 24px;border-top:1px solid var(--border);color:var(--muted);font-size:12px}
</style></head><body>
<header><h1><span>stingo</span> output</h1>
  <div class="dim">${vids.length} file${vids.length === 1 ? '' : 's'} in <code>out/</code> · page refreshes as renders finish</div>
</header>
<main>
${vids.length === 0 ? '<div class="empty">nothing rendered yet…</div>' : vids.map((v) => {
  const vertical = /vertical/.test(v.path);
  return `<div class="card ${vertical ? 'v' : 'h'}">
    <h2><span>${v.label}</span><em>${(v.size / 1048576).toFixed(1)} MB · <a href="/f/${v.path}" download>download</a></em></h2>
    <video src="/f/${v.path}" controls preload="metadata"${vertical ? '' : ''}></video>
  </div>`;
}).join('\n')}
</main>
<footer>served from ${ROOT}/ — scrub, pause, download. Reload to pick up new renders.</footer>
<script>
  // poll for newly finished renders and reload when the set changes
  let sig = ${JSON.stringify(vids.map((v) => v.path + v.size).join('|'))};
  setInterval(async () => {
    try { const r = await (await fetch('/list')).json();
      const s = r.map(v => v.path + v.size).join('|');
      if (s !== sig) location.reload();
    } catch {}
  }, 5000);
</script>
</body></html>`;

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response(html(await listVideos()), { headers: { 'content-type': 'text/html; charset=utf-8' } });
    if (url.pathname === '/list') return Response.json(await listVideos());

    if (url.pathname.startsWith('/f/')) {
      const rel = decodeURIComponent(url.pathname.slice(3));
      if (rel.includes('..')) return new Response('nope', { status: 400 });
      const file = Bun.file(join(ROOT, rel));
      if (!(await file.exists())) return new Response('not found', { status: 404 });
      const type = TYPES[extname(rel)] ?? 'application/octet-stream';
      const size = file.size;
      const range = req.headers.get('range');
      // browsers will not scrub a video unless the server answers range requests
      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        const start = m?.[1] ? Number(m[1]) : 0;
        const end = m?.[2] ? Number(m[2]) : size - 1;
        return new Response(file.slice(start, end + 1), {
          status: 206,
          headers: { 'content-type': type, 'content-range': `bytes ${start}-${end}/${size}`,
                     'accept-ranges': 'bytes', 'content-length': String(end - start + 1) },
        });
      }
      return new Response(file, { headers: { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(size) } });
    }
    return new Response('not found', { status: 404 });
  },
});

console.log(`\n\x1b[1m\x1b[35mstingo\x1b[0m output player\n`);
console.log(`  \x1b[36mhttp://localhost:${PORT}\x1b[0m\n`);
console.log(`\x1b[2m  serving ./out — the page reloads itself as renders land\x1b[0m`);
