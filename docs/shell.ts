import { SECTIONS, type Page } from './nav';

export const url = (base: string, p: string) => {
  if (/^(https?:|mailto:|#)/.test(p)) return p;
  return `${base}/${p.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/') || '/';
};

export const GITHUB = 'https://github.com/aynaash/stingo';

/** Design tokens.
 *
 *  The palette is not chosen for this site — it is the output of
 *  `stingo taste "#ff7a18"`, the same derived profile the launch video uses.
 *  So the documentation is painted by the tool it documents, and the contrast
 *  ratios were audited by that tool's own house floors (body 7:1, accents
 *  4.5:1) rather than by eye.
 *
 *  The neutrals carry a trace of the brand hue on purpose — that is stingo's
 *  `neutralChroma`, and it is why the dark ground reads as warm brown rather
 *  than as grey standing in for black. */
const CSS = String.raw`
:root {
  --bg:      #130905;
  --surface: #271004;
  --raised:  #341503;
  --border:  #4c240c;
  --text:    #fef1ea;
  --muted:   #a9826e;
  --accent:  #ef7e39;
  --cyan:    #2ecaf5;
  --ok:      #74c878;

  --mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --sans: Inter, system-ui, -apple-system, "Segoe UI", sans-serif;

  /* one ratio, applied throughout — the same idea as the house type scale */
  --step--1: clamp(0.82rem, 0.8rem + 0.1vw, 0.88rem);
  --step-0:  clamp(1rem, 0.97rem + 0.15vw, 1.08rem);
  --step-1:  clamp(1.28rem, 1.2rem + 0.4vw, 1.5rem);
  --step-2:  clamp(1.64rem, 1.45rem + 0.9vw, 2.1rem);
  --step-3:  clamp(2.1rem, 1.7rem + 2vw, 3.4rem);
  --step-4:  clamp(2.6rem, 1.8rem + 4vw, 5.2rem);

  --rail: 16rem;
  --measure: 68ch;
}

*, *::before, *::after { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; scroll-behavior: smooth; scroll-padding-top: 5rem; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: var(--step-0);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

a { color: var(--accent); text-underline-offset: 0.2em; text-decoration-thickness: 1px; }
a:hover { color: var(--text); }
:focus-visible { outline: 2px solid var(--cyan); outline-offset: 3px; border-radius: 2px; }

img { max-width: 100%; height: auto; display: block; }
hr { border: 0; border-top: 1px solid var(--border); margin: 3rem 0; }

/* ── the beat ruler ───────────────────────────────────────────────────────
   stingo snaps every cut to a bar. The ruler is that idea made visible, and
   it is the only ornament on the site: short ticks are beats, tall ones are
   downbeats. It marks the seam between sections the way a timeline marks
   the seam between scenes. */
.ruler {
  height: 13px;
  background-repeat: repeat-x;
  background-position: left bottom, left bottom;
  background-image:
    repeating-linear-gradient(90deg, var(--border) 0 1px, transparent 1px 22px),
    repeating-linear-gradient(90deg, var(--accent) 0 1px, transparent 1px 88px);
  background-size: 100% 5px, 100% 11px;
  opacity: 0.85;
}

/* ── header ─────────────────────────────────────────────────────────────── */
.top {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 1.5rem;
  padding: 0.85rem clamp(1rem, 4vw, 2.5rem);
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
}
.wordmark {
  font-family: var(--mono); font-weight: 800; font-size: 1.12rem;
  letter-spacing: -0.045em; color: var(--text); text-decoration: none;
  white-space: nowrap; flex: none;
}
.wordmark::after { content: ""; display: inline-block; width: 0.42em; height: 0.42em; margin-left: 0.32em; border-radius: 50%; background: var(--accent); vertical-align: 0.08em; }
.top nav { margin-left: auto; display: flex; gap: 1.4rem; align-items: center; }
@media (max-width: 34rem) {
  .top { gap: 0.9rem; }
  .top nav { gap: 0.9rem; }
  /* the source link and the docs matter on a phone; the rest can wait */
  .top nav a[data-optional] { display: none; }
}
.top nav a { color: var(--muted); text-decoration: none; font-size: var(--step--1); }
.top nav a:hover, .top nav a[aria-current] { color: var(--text); }

/* ── landing ────────────────────────────────────────────────────────────── */
.wrap { width: min(100% - 2rem, 74rem); margin-inline: auto; }
.wide { width: min(100% - 2rem, 88rem); margin-inline: auto; }

.hero { padding-block: clamp(3.5rem, 9vw, 7rem) 0; }
.hero h1 {
  font-family: var(--mono); font-weight: 800;
  font-size: var(--step-4); line-height: 0.98; letter-spacing: -0.05em;
  margin: 0 0 1.2rem; max-width: 16ch;
}
.hero p.lede { font-size: var(--step-1); color: var(--muted); margin: 0 0 2.2rem; max-width: 46ch; line-height: 1.45; }
.hero .cta { display: flex; gap: 0.8rem; flex-wrap: wrap; align-items: center; }

.btn {
  display: inline-block; padding: 0.7rem 1.35rem; border-radius: 6px;
  font-family: var(--mono); font-size: var(--step--1); font-weight: 700;
  text-decoration: none; border: 1px solid transparent;
}
.btn-fill { background: var(--accent); color: #2a1002; }
.btn-fill:hover { background: var(--text); color: var(--bg); }
.btn-line { border-color: var(--border); color: var(--text); }
.btn-line:hover { border-color: var(--accent); color: var(--accent); }

/* source on the left, the frame it produced on the right */
.io { display: grid; gap: 1.1rem; grid-template-columns: minmax(0, 0.92fr) minmax(0, 1.08fr); align-items: start; margin-top: clamp(2.5rem, 5vw, 4rem); }
@media (max-width: 60rem) { .io { grid-template-columns: 1fr; } }
.io > * { min-width: 0; }
.pane {
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
  overflow: hidden; display: flex; flex-direction: column;
}
.pane-head {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.5rem 0.85rem; border-bottom: 1px solid var(--border);
  background: var(--raised);
  font-family: var(--mono); font-size: 0.76rem; color: var(--muted);
}
.pane-head i { width: 0.5rem; height: 0.5rem; border-radius: 50%; background: var(--border); }
.pane-head i.on { background: var(--accent); }
.pane figure, .pane pre { margin: 0; }
.pane img { width: 100%; }
.pane .code { border: 0; border-radius: 0; }
.pane .code pre { border-radius: 0; }

.section { padding-block: clamp(3.5rem, 8vw, 6rem); }
.section h2 {
  font-family: var(--mono); font-weight: 800; font-size: var(--step-2);
  letter-spacing: -0.035em; line-height: 1.1; margin: 0 0 0.7rem; max-width: 22ch;
}
.section > p { color: var(--muted); max-width: var(--measure); margin: 0 0 2rem; }

.three { display: grid; gap: 1rem; grid-template-columns: repeat(3, minmax(0, 1fr)); }
@media (max-width: 62rem) { .three { grid-template-columns: 1fr; } }
.swatch { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.swatch img { width: 100%; }
.swatch figcaption {
  padding: 0.6rem 0.85rem; font-family: var(--mono); font-size: 0.78rem;
  color: var(--muted); border-top: 1px solid var(--border);
  display: flex; justify-content: space-between; gap: 1rem;
}
.swatch b { color: var(--text); font-weight: 700; }

.gallery { display: grid; gap: 1rem; grid-template-columns: repeat(4, minmax(0, 1fr)); }
@media (max-width: 70rem) { .gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.gallery figure { margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; background: var(--surface); }
.gallery figcaption { padding: 0.55rem 0.8rem; font-family: var(--mono); font-size: 0.76rem; color: var(--muted); border-top: 1px solid var(--border); }

/* the constraints — a list of claims, each with its consequence */
.claims { display: grid; gap: 0; border-top: 1px solid var(--border); }
.claims > div { display: grid; gap: 0.4rem 2.5rem; grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); padding: 1.6rem 0; border-bottom: 1px solid var(--border); }
@media (max-width: 58rem) { .claims > div { grid-template-columns: 1fr; } }
.claims h3 { margin: 0; font-family: var(--mono); font-weight: 700; font-size: var(--step-0); letter-spacing: -0.02em; }
.claims p { margin: 0; color: var(--muted); max-width: 62ch; }

/* ── docs layout ────────────────────────────────────────────────────────── */
.doc { display: grid; grid-template-columns: var(--rail) minmax(0, 1fr) 14rem; gap: clamp(1.5rem, 4vw, 3.5rem); align-items: start;
  width: min(100% - 2rem, 82rem); margin-inline: auto; padding-block: 2.5rem 5rem; }
@media (max-width: 74rem) { .doc { grid-template-columns: var(--rail) minmax(0, 1fr); } .toc { display: none; } }
@media (max-width: 54rem) { .doc { grid-template-columns: 1fr; } }

.rail { position: sticky; top: 5rem; font-size: var(--step--1); }
@media (max-width: 54rem) { .rail { position: static; border-bottom: 1px solid var(--border); padding-bottom: 1.5rem; } }
.rail h4 { margin: 1.6rem 0 0.5rem; font-family: var(--mono); font-size: 0.72rem; font-weight: 700; color: var(--muted); letter-spacing: 0.04em; }
.rail h4:first-child { margin-top: 0; }
.rail ul { list-style: none; margin: 0; padding: 0; }
.rail li a { display: block; padding: 0.3rem 0 0.3rem 0.8rem; margin-left: -0.06rem; color: var(--muted); text-decoration: none; border-left: 2px solid var(--border); }
.rail li a:hover { color: var(--text); border-left-color: var(--muted); }
.rail li a[aria-current] { color: var(--accent); border-left-color: var(--accent); background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 9%, transparent), transparent); }

.toc { position: sticky; top: 5rem; font-size: 0.82rem; }
.toc p { font-family: var(--mono); font-size: 0.72rem; color: var(--muted); margin: 0 0 0.6rem; }
.toc a { display: block; padding: 0.22rem 0; color: var(--muted); text-decoration: none; }
.toc a:hover { color: var(--text); }
.toc a[data-depth="3"] { padding-left: 0.9rem; }

/* ── prose ──────────────────────────────────────────────────────────────── */
.prose { min-width: 0; }
.prose > * { max-width: var(--measure); }
.prose > .code, .prose > figure, .prose > .table-wrap { max-width: none; }
.prose h1 { font-family: var(--mono); font-weight: 800; font-size: var(--step-3); letter-spacing: -0.04em; line-height: 1.05; margin: 0 0 0.5rem; }
.prose .blurb { color: var(--muted); font-size: var(--step-1); line-height: 1.45; margin: 0 0 2.5rem; }
.prose h2 { font-family: var(--mono); font-weight: 800; font-size: var(--step-1); letter-spacing: -0.03em; margin: 3rem 0 0.9rem; padding-top: 1.6rem; border-top: 1px solid var(--border); }
.prose h3 { font-family: var(--mono); font-weight: 700; font-size: var(--step-0); letter-spacing: -0.02em; margin: 2rem 0 0.6rem; }
.prose p, .prose ul, .prose ol { margin: 0 0 1.1rem; }
.prose li { margin-bottom: 0.35rem; }
.prose strong { color: var(--text); font-weight: 600; }
.prose blockquote { margin: 1.5rem 0; padding: 0.1rem 0 0.1rem 1.2rem; border-left: 2px solid var(--accent); color: var(--muted); }

.anchor { float: left; margin-left: -1.1em; padding-right: 0.35em; color: var(--border); text-decoration: none; opacity: 0; }
h2:hover .anchor, h3:hover .anchor, .anchor:focus { opacity: 1; }

.prose :not(pre) > code {
  font-family: var(--mono); font-size: 0.88em;
  background: var(--surface); border: 1px solid var(--border);
  padding: 0.08em 0.36em; border-radius: 4px; color: var(--text);
}

.code { margin: 1.4rem 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; position: relative; background: var(--surface); }
.code::after {
  content: attr(data-lang); position: absolute; top: 0; right: 0;
  padding: 0.25rem 0.6rem; font-family: var(--mono); font-size: 0.68rem;
  color: var(--muted); border-left: 1px solid var(--border); border-bottom: 1px solid var(--border);
  border-bottom-left-radius: 6px; background: var(--raised);
}
.code pre { margin: 0; padding: 1rem 1.1rem; overflow-x: auto; font-size: 0.85rem; line-height: 1.6; background: transparent !important; }
.code pre code { font-family: var(--mono); }

.table-wrap { overflow-x: auto; margin: 1.4rem 0; border: 1px solid var(--border); border-radius: 8px; }
.prose table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
.prose th, .prose td { text-align: left; padding: 0.6rem 0.9rem; border-bottom: 1px solid var(--border); vertical-align: top; }
.prose th { font-family: var(--mono); font-size: 0.76rem; font-weight: 700; color: var(--muted); background: var(--raised); }
.prose tbody tr:last-child td { border-bottom: 0; }
.prose td code { white-space: nowrap; }

.pager { display: flex; justify-content: space-between; gap: 1rem; margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border); }
.pager a { max-width: 48%; text-decoration: none; color: var(--muted); font-size: var(--step--1); }
.pager a:hover { color: var(--text); }
.pager b { display: block; font-family: var(--mono); color: var(--accent); font-weight: 700; }
.pager a:hover b { color: var(--text); }

/* ── footer ─────────────────────────────────────────────────────────────── */
footer { border-top: 1px solid var(--border); margin-top: 4rem; }
.foot { display: flex; flex-wrap: wrap; gap: 1.2rem 2.5rem; padding-block: 2.5rem 3.5rem; color: var(--muted); font-size: var(--step--1); }
.foot a { color: var(--muted); text-decoration: none; }
.foot a:hover { color: var(--text); }
.foot .grow { margin-left: auto; }
`;

const FONTS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;700;800&display=swap">`;

export function head(base: string, opts: { title: string; description: string; path: string }) {
  const u = (p: string) => url(base, p);
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.title}</title>
<meta name="description" content="${esc(opts.description)}">
<meta property="og:title" content="${esc(opts.title)}">
<meta property="og:description" content="${esc(opts.description)}">
<meta property="og:type" content="website">
<meta property="og:image" content="${u('assets/img/hero-code.webp')}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${u('assets/favicon.svg')}" type="image/svg+xml">${FONTS}
<style>${CSS}</style>`;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function topbar(base: string, current?: string) {
  const u = (p: string) => url(base, p);
  return `<header class="top">
  <a class="wordmark" href="${u('/')}">stingo</a>
  <nav>
    <a href="${u('start')}"${current ? ' aria-current="page"' : ''}>Docs</a>
    <a href="${u('camera')}" data-optional>Talking head</a>
    <a href="${GITHUB}/tree/main/examples" data-optional target="_blank" rel="noopener">Examples</a>
    <a href="${GITHUB}" target="_blank" rel="noopener">GitHub</a>
  </nav>
</header>
<div class="ruler" aria-hidden="true"></div>`;
}

export function footer(base: string) {
  const u = (p: string) => url(base, p);
  return `<footer><div class="wrap foot">
  <span>stingo — declarative video for people who ship content.</span>
  <a href="${GITHUB}/blob/main/LICENSE" target="_blank" rel="noopener">AGPL-3.0</a>
  <a href="${u('start')}">Docs</a>
  <a href="${GITHUB}" target="_blank" rel="noopener">Source</a>
  <span class="grow">Built with stingo, and documented in its own palette.</span>
</div></footer>`;
}

export function shell(o: { base: string; page: Page; body: string; outline: { id: string; text: string; depth: number }[]; pages: Page[] }) {
  const { base, page, body, outline, pages } = o;
  const u = (p: string) => url(base, p);
  const i = pages.findIndex((p) => p.slug === page.slug);
  const prev = pages[i - 1], next = pages[i + 1];

  const rail = SECTIONS.map((s) => `<h4>${s}</h4><ul>${
    pages.filter((p) => p.section === s).map((p) =>
      `<li><a href="${u(p.slug)}"${p.slug === page.slug ? ' aria-current="page"' : ''}>${p.title}</a></li>`).join('')
  }</ul>`).join('');

  const toc = outline.length > 2
    ? `<aside class="toc"><p>On this page</p>${outline.map((h) =>
        `<a href="#${h.id}" data-depth="${h.depth}">${esc(h.text)}</a>`).join('')}</aside>`
    : '<aside class="toc"></aside>';

  // tables need a scroll container of their own on narrow screens
  const withTables = body.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');

  return `<!doctype html><html lang="en"><head>
${head(base, { title: `${page.title} · stingo`, description: page.blurb, path: page.slug })}
</head><body>
${topbar(base, page.slug)}
<div class="doc">
  <nav class="rail" aria-label="Documentation">${rail}</nav>
  <main class="prose">
    <h1>${page.title}</h1>
    <p class="blurb">${esc(page.blurb)}</p>
    ${withTables}
    <div class="pager">
      ${prev ? `<a href="${u(prev.slug)}"><b>Previous</b>${prev.title}</a>` : '<span></span>'}
      ${next ? `<a href="${u(next.slug)}" style="text-align:right"><b>Next</b>${next.title}</a>` : '<span></span>'}
    </div>
  </main>
  ${toc}
</div>
${footer(base)}
</body></html>`;
}
