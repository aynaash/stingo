# The documentation site

A static site with no framework: markdown in `content/`, one shell in
`shell.ts`, a hand-written landing page in `landing.ts`, built by `build.ts`.

```bash
bun run docs:dev      # build, serve on :4444, rebuild on save
bun run docs:build    # → docs/.dist
```

## Base paths

Every URL goes through `url()`, which prefixes `BASE`. That is what lets one
build serve from two places:

```bash
bun run docs:build                    # rooted at /        (local)
BASE=/stingo bun run docs:build       # rooted at /stingo  (Pages, hersietech.com)
```

`.github/workflows/docs.yml` publishes to GitHub Pages on every push to `main`
that touches `docs/`, passing `BASE=/<repo>`.

For **hersietech.com/stingo**, build with the same base and upload the tree:

```bash
BASE=/stingo bun run docs:build
rsync -av --delete docs/.dist/ you@hersietech.com:/var/www/hersietech.com/stingo/
```

Serve it as a static directory. URLs are clean (`/stingo/camera`), so the server
needs to resolve a directory to its `index.html` — nginx does that with
`try_files $uri $uri/ $uri/index.html =404;`.

## Why it looks like this

The palette is not a design decision made for the site. It is the output of
`stingo taste "#ff7a18"` — the same derived profile the launch video uses — so
the documentation is painted by the tool it documents, and its contrast ratios
were audited by that tool's own house floors rather than by eye.

The syntax theme is built from those same eight colours instead of an
off-the-shelf one, which would bring its own hue relationships and fight the
ground it sits on.

The ruler between sections is the only ornament: short ticks are beats, tall
ones downbeats. stingo snaps every cut to a bar, and that is the idea made
visible.

## Images

Screenshots are real `stingo still` output, rendered in the site's own taste
profile and converted to WebP:

```bash
bun stingo still examples/goroutines/video.yaml --at 23 --horizontal \
  --taste examples/building-stingo/taste.json -o /tmp/shot.png --no-hud
ffmpeg -i /tmp/shot.png -vf "scale=1400:-2:flags=lanczos" -q:v 80 docs/assets/img/hero-code.webp
```

Keep them small. The whole `assets/img` directory is under 150 KB, and it
should stay that way.
