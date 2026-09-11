/** The docs site generator.
 *
 *  Deliberately small: reads markdown out of docs/content, wraps each page in
 *  one shell, and writes a static tree to docs/.dist. No framework, because the
 *  site is a dozen pages and a framework would be more code than the site.
 *
 *  Every URL is written through `url()`, which prefixes BASE. That is what lets
 *  the same build serve from a GitHub Pages project path (/stingo) and from
 *  hersietech.com/stingo without a second pipeline.
 *
 *    bun run docs:build              → docs/.dist, rooted at /
 *    BASE=/stingo bun run docs:build → rooted at /stingo
 *    bun run docs:dev                → build, serve, rebuild on change
 */
import { marked } from 'marked';
import { mkdir, rm, cp, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createHighlighter } from 'shiki';
import { PAGES, type Page } from './nav';
import { landing } from './landing';
import { shell, url as mkUrl } from './shell';

const ROOT = dirname(Bun.fileURLToPath(import.meta.url));
const DIST = join(ROOT, '.dist');
const BASE = (process.env.BASE ?? '').replace(/\/+$/, '');

export const url = (p: string) => mkUrl(BASE, p);

/** A syntax theme built from the site's palette rather than picked off a
 *  shelf. An off-the-shelf dark theme brings its own hue relationships and
 *  fights the ground it sits on; this one is the same eight colours the rest
 *  of the page uses, which is also how a taste profile colours code inside a
 *  video. */
const CODE_THEME = {
  name: 'stingo',
  type: 'dark' as const,
  colors: { 'editor.background': '#00000000', 'editor.foreground': '#fef1ea' },
  settings: [
    { scope: ['comment', 'punctuation.definition.comment'], settings: { foreground: '#a9826e', fontStyle: 'italic' } },
    { scope: ['string', 'string.quoted', 'meta.embedded.line'], settings: { foreground: '#74c878' } },
    { scope: ['constant.numeric', 'constant.language', 'constant.character'], settings: { foreground: '#f0bb3b' } },
    { scope: ['keyword', 'storage', 'storage.type', 'keyword.control', 'keyword.operator.new'], settings: { foreground: '#ef7e39' } },
    { scope: ['entity.name.function', 'support.function', 'meta.function-call'], settings: { foreground: '#2ecaf5' } },
    { scope: ['entity.name.type', 'support.type', 'support.class', 'entity.name.class'], settings: { foreground: '#2ecaf5' } },
    { scope: ['variable', 'variable.other', 'meta.definition.variable'], settings: { foreground: '#fef1ea' } },
    { scope: ['entity.name.tag', 'support.type.property-name', 'meta.object-literal.key'], settings: { foreground: '#ef7e39' } },
    { scope: ['punctuation', 'meta.brace', 'keyword.operator'], settings: { foreground: '#a9826e' } },
    { scope: ['markup.inserted', 'punctuation.definition.inserted'], settings: { foreground: '#74c878' } },
    { scope: ['markup.deleted', 'punctuation.definition.deleted'], settings: { foreground: '#ff8880' } },
  ],
};

const highlighter = await createHighlighter({
  themes: [CODE_THEME],
  langs: ['yaml', 'ts', 'tsx', 'js', 'json', 'bash', 'go', 'diff', 'css', 'html', 'text'],
});

/** Code fences go through the same highlighter that renders code inside a
 *  video, so a sample on the site and the same sample on screen agree. */
marked.use({
  renderer: {
    code({ text, lang }) {
      // an unknown fence is far more often a diagram than a shell script, and
      // colouring box-drawing characters at random looks like a bug
      const language = highlighter.getLoadedLanguages().includes(lang as never) ? lang! : 'text';
      const html = highlighter.codeToHtml(text, { lang: language, theme: 'stingo' });
      return `<figure class="code" data-lang="${language}">${html}</figure>`;
    },
    heading({ tokens, depth }) {
      const text = this.parser!.parseInline(tokens);
      const id = slug(text);
      // anchors on h2/h3 only: h1 is the page title and needs no self-link
      return depth >= 2 && depth <= 3
        ? `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${text}</h${depth}>`
        : `<h${depth}>${text}</h${depth}>`;
    },
    link({ href, tokens }) {
      const text = this.parser!.parseInline(tokens);
      const external = /^https?:/.test(href);
      const to = external ? href : url(href);
      const attrs = external ? ' target="_blank" rel="noopener"' : '';
      return `<a href="${to}"${attrs}>${text}</a>`;
    },
    image({ href, text }) {
      return `<img src="${url(href)}" alt="${text}" loading="lazy" decoding="async">`;
    },
  },
});

const slug = (s: string) =>
  s.replace(/<[^>]+>/g, '').toLowerCase().trim()
    .replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-');

/** Pull the h2/h3 headings out of rendered HTML for the on-page contents. */
function outline(html: string): { id: string; text: string; depth: number }[] {
  const out: { id: string; text: string; depth: number }[] = [];
  const re = /<h([23]) id="([^"]+)">(?:<a[^>]*>#<\/a>)?([\s\S]*?)<\/h[23]>/g;
  for (const m of html.matchAll(re)) {
    out.push({ depth: Number(m[1]), id: m[2]!, text: m[3]!.replace(/<[^>]+>/g, '') });
  }
  return out;
}

async function build() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(DIST, { recursive: true });

  // landing page
  const hl = (code: string, lang: string) =>
    highlighter.codeToHtml(code.trim(), { lang, theme: 'stingo' });
  await Bun.write(join(DIST, 'index.html'), landing(BASE, hl));

  // one directory per page, so URLs have no .html on them
  for (const page of PAGES) {
    const md = await Bun.file(join(ROOT, 'content', `${page.slug}.md`)).text();
    const body = await marked.parse(md);
    const html = shell({
      base: BASE, page, body, outline: outline(body), pages: PAGES,
    });
    const dir = join(DIST, page.slug);
    await mkdir(dir, { recursive: true });
    await Bun.write(join(dir, 'index.html'), html);
  }

  await cp(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });

  // Pages would otherwise run the output through Jekyll, which strips
  // directories beginning with an underscore and can rewrite files
  await Bun.write(join(DIST, '.nojekyll'), '');
  await Bun.write(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n`);

  const files = await count(DIST);
  console.log(`docs → ${DIST}  (${files} files, base "${BASE || '/'}")`);
}

async function count(dir: string): Promise<number> {
  let n = 0;
  for (const e of await readdir(dir, { withFileTypes: true })) {
    n += e.isDirectory() ? await count(join(dir, e.name)) : 1;
  }
  return n;
}

await build();

if (process.argv.includes('--serve')) {
  const port = Number(process.env.PORT ?? 4444);
  Bun.serve({
    port,
    async fetch(req) {
      const path = new URL(req.url).pathname.replace(/^\/+/, '');
      const rel = BASE && path.startsWith(BASE.slice(1)) ? path.slice(BASE.length - 1) : path;
      for (const candidate of [rel, join(rel, 'index.html'), 'index.html']) {
        const f = Bun.file(join(DIST, candidate || 'index.html'));
        if (await f.exists()) return new Response(f);
      }
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`serving http://localhost:${port}${BASE}/`);

  const { watch } = await import('node:fs');
  let timer: Timer | undefined;
  for (const dir of ['content', 'assets']) {
    watch(join(ROOT, dir), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => build().catch((e) => console.error(e.message)), 80);
    });
  }
}
