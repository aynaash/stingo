import { head, topbar, footer, url, GITHUB } from './shell';

/** The landing page.
 *
 *  The hero is the product's actual claim, shown rather than described: the
 *  script on the left, the frame that script produced on the right. Both are
 *  real — the image is `stingo still` output, and the YAML beside it is the
 *  scene that made it. Nothing here is a mockup. */
export function landing(base: string, hl: (code: string, lang: string) => string): string {
  const u = (p: string) => url(base, p);

  // the scene beside the frame is the scene that produced it
  const scene = `- block: compare
  left:
    title: OS thread
    items:
      - 1 MB stack, reserved up front
      - Kernel schedules it
      - Context switch costs microseconds
  right:
    title: goroutine
    items:
      - 2 KB stack, grows on demand
      - Go runtime schedules it
      - Switch costs nanoseconds`;

  return `<!doctype html><html lang="en"><head>
${head(base, {
    title: 'stingo — a video is a text file',
    description: 'Declarative video for people who ship content. Write a script, pick a taste profile, render an MP4 with cuts that land on the beat. Open source, AGPL-3.0.',
    path: '',
  })}
</head><body>
${topbar(base)}

<section class="hero wide">
  <h1>A video is a text file.</h1>
  <p class="lede">Write the script. Pick a taste. Render an MP4 — vertical or
  horizontal, with every cut landing on a downbeat.</p>
  <div class="cta">
    <a class="btn btn-fill" href="${u('start')}">Get started</a>
    <a class="btn btn-line" href="${GITHUB}" target="_blank" rel="noopener">Source on GitHub</a>
  </div>

  <div class="io">
    <div class="pane">
      <div class="pane-head"><i class="on"></i><i></i><i></i> video.yaml</div>
      <figure class="code" data-lang="yaml">${hl(scene, 'yaml')}</figure>
    </div>
    <div class="pane">
      <div class="pane-head"><i></i><i></i><i class="on"></i> frame 690 · 23.00s</div>
      <img src="${u('assets/img/hero-code.webp')}" width="1400" height="788"
           alt="A rendered frame: two panels comparing OS threads and goroutines, on a warm dark grid.">
    </div>
  </div>
</section>

<div class="wide"><div class="ruler" aria-hidden="true"></div></div>

<section class="section wide">
  <h2>Change the taste, not the script</h2>
  <p>The script never names a colour. The taste profile never names your topic.
  These three frames are the same nine lines of YAML, rendered against three
  profiles — one of them derived from a single brand colour by
  <code>stingo taste "#ff7a18"</code>.</p>

  <div class="three">
    <figure class="swatch">
      <img src="${u('assets/img/taste-bootdev.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same comparison scene in a violet palette.">
      <figcaption><b>Boot Camp</b><span>snappy · bar</span></figcaption>
    </figure>
    <figure class="swatch">
      <img src="${u('assets/img/taste-dusk.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same comparison scene in a warm sand palette.">
      <figcaption><b>Dusk</b><span>smooth · free</span></figcaption>
    </figure>
    <figure class="swatch">
      <img src="${u('assets/img/taste-hersie.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same comparison scene in an amber palette.">
      <figcaption><b>Derived</b><span>from one hex</span></figcaption>
    </figure>
  </div>
</section>

<section class="section wide">
  <h2>Put yourself in the frame</h2>
  <p>An explainer usually needs the explainer in it. A recorded take drops into
  any scene, full frame, as a corner inset, or beside the content — and its
  audio is trimmed, placed and ducked under the music with no manual sync.</p>

  <div class="io">
    <div class="pane">
      <div class="pane-head"><i class="on"></i><i></i><i></i> a scene with a take</div>
      <figure class="code" data-lang="yaml">${hl(`- block: code
  lang: go
  code: |
    go download("a.txt")
  camera:
    src: takes/02.mp4
    from: 6
    layout: pip        # full | pip | split
    corner: br
    shape: circle`, 'yaml')}</figure>
    </div>
    <div class="pane">
      <div class="pane-head"><i></i><i class="on"></i><i></i> three layouts</div>
      <figure class="code" data-lang="diagram">${hl(`  full                pip                 split

┌───────────┐      ┌───────────┐      ┌─────┬─────┐
│           │      │ code {}   │      │     │code │
│  ( you )  │      │        ┌──┤      │(you)│ {}  │
│           │      │        │yo│      │     │     │
└───────────┘      └────────┴──┘      └─────┴─────┘

  delivery           over code          side by side`, 'text')}</figure>
    </div>
  </div>
</section>

<section class="section wide">
  <h2>Twelve blocks, one type scale</h2>
  <p>Each block sizes itself from the stage, so the same script renders to
  1080×1920, 1920×1080 or square without a second layout.</p>
  <div class="gallery">
    <figure><img src="${u('assets/img/block-code.webp')}" width="520" height="924" loading="lazy" decoding="async" alt="A code block with highlighted lines."><figcaption>code</figcaption></figure>
    <figure><img src="${u('assets/img/block-stat.webp')}" width="520" height="924" loading="lazy" decoding="async" alt="A large statistic with a label."><figcaption>stat</figcaption></figure>
    <figure><img src="${u('assets/img/block-list.webp')}" width="520" height="924" loading="lazy" decoding="async" alt="A titled list with arrow markers."><figcaption>list</figcaption></figure>
    <figure><img src="${u('assets/img/block-terminal.webp')}" width="520" height="924" loading="lazy" decoding="async" alt="A terminal window with commands and output."><figcaption>terminal</figcaption></figure>
  </div>
</section>

<section class="section wrap">
  <h2>Three constraints, and what they buy</h2>
  <div class="claims">
    <div>
      <h3>A frame is a pure function of its index</h3>
      <p>Nothing carries over between frames. <code>film.framePixels(4821)</code>
      renders frame 4821 without rendering the 4820 before it — which is what
      makes scrubbing instant, rendering parallel across processes, and output
      byte-identical between runs.</p>
    </div>
    <div>
      <h3>Layout is CSS, drawing is SVG</h3>
      <p>satori does real flexbox and emits SVG with no browser involved; resvg
      rasterises it. Procedural graphics that flexbox cannot express are
      hand-written SVG spliced into the same document and rasterised in one
      pass.</p>
    </div>
    <div>
      <h3>Cuts land on the music</h3>
      <p>Point it at a track and the beat grid is detected — spectral-flux
      onsets, autocorrelation tempo with a log-normal prior so it does not pick
      half or double time. Scene ends snap to bars, so every cut is a downbeat.</p>
    </div>
  </div>
</section>

<section class="section wrap">
  <h2>Render the example</h2>
  <figure class="code" data-lang="bash">${hl(`git clone ${GITHUB.replace('https://', '')}
cd stingo && bun install

bun stingo render examples/goroutines/video.yaml`, 'bash')}</figure>
  <p>Needs Bun 1.3 or newer and ffmpeg on your <code>PATH</code>.
  <a href="${u('start')}">The full walkthrough</a> changes one line and re-renders,
  which is the whole point.</p>
</section>

${footer(base)}
</body></html>`;
}

