import { head, topbar, footer, url, GITHUB } from './shell';

/** The landing page.
 *
 *  It leads with the agent loop, because that is the shortest path from "I want
 *  a video about X" to a finished MP4 for most people. The claim underneath is
 *  the one that makes it possible at all: a video here is a text file, so a
 *  model can write one — and, crucially, render a frame and look at what it
 *  made.
 *
 *  Everything shown is real. The frame is `stingo still` output, the YAML
 *  beside it is the scene that produced it, and the transcript is the actual
 *  tool sequence the MCP server exposes. */
export function landing(base: string, hl: (code: string, lang: string) => string): string {
  const u = (p: string) => url(base, p);

  const transcript = `you     make me a five minute explainer on Go concurrency.
        vertical, dark, cuts on the beat

claude  ⏺ stingo_docs      script, blocks
        ⏺ stingo_validate  ✓ 52 scenes, 1080x1920
        ⏺ stingo_plan      4:50 · every cut on a downbeat
        ⏺ stingo_still     at 23.0s  →  the frame, returned as an image`;

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

  const mcpConfig = `{
  "mcpServers": {
    "stingo": {
      "command": "bun",
      "args": ["run", "packages/mcp/bin/stingo-mcp.ts"]
    }
  }
}`;

  return `<!doctype html><html lang="en"><head>
${head(base, {
    title: 'stingo — let your AI make the video',
    description: 'A video is a text file, so a model can write one — and render a frame to see what it made. '
      + 'Declarative video for engineers: scripts, taste profiles, talking-head takes, cuts on the beat. Open source, AGPL-3.0.',
    path: '',
  })}
</head><body>
${topbar(base)}

<section class="hero wide">
  <h1>Let your AI make the video.</h1>
  <p class="lede">A video here is a text file — so a model can write one, render
  a frame, look at what it made, and fix it. Connect an agent and describe what
  you want.</p>
  <p class="etymology"><b>Stingo</b> is Sheng, the Swahili-English creole spoken
  in Nairobi, for <b>aesthetics</b>. Which is the idea: the look of a film is a
  thing you can name, keep in its own file, and swap.</p>
  <div class="cta">
    <a class="btn btn-fill" href="${u('mcp')}">Connect your AI</a>
    <a class="btn btn-line" href="${u('start')}">Write it yourself</a>
    <a class="btn btn-line" href="${GITHUB}" target="_blank" rel="noopener">Source</a>
  </div>

  <div class="io">
    <div class="pane">
      <div class="pane-head"><i class="on"></i><i></i><i></i> an agent with stingo connected</div>
      <figure class="code" data-lang="session">${hl(transcript, 'text')}</figure>
    </div>
    <div class="pane">
      <div class="pane-head"><i></i><i></i><i class="on"></i> what came back · frame 690</div>
      <img src="${u('assets/img/hero-code.webp')}" width="1400" height="788"
           alt="A rendered frame: two panels comparing OS threads and goroutines, on a warm dark grid.">
    </div>
  </div>
</section>

<div class="wide"><div class="ruler" aria-hidden="true"></div></div>

<section class="section wrap">
  <h2>Three lines, and your agent can render video</h2>
  <p>The MCP server runs from a clone today. It hands an agent eleven tools:
  read the documentation, validate a script, resolve the timeline, render a
  frame, render the film.</p>
  <figure class="code" data-lang="json">${hl(mcpConfig, 'json')}</figure>
  <p>The tool that matters is <code>stingo_still</code> — it returns the PNG
  itself, not a path. A model that can see the frame it just wrote catches what
  a schema cannot: a line too long for the frame, a chart whose highlighted bar
  is invisible, a scene that is over before it can be read.
  <a href="${u('mcp')}">Setting it up</a>.</p>
</section>

<section class="section wide">
  <h2>What comes out</h2>
  <p>The opening of <a href="${GITHUB}/tree/main/examples/goroutines">the example film</a> —
  five minutes of vertical and horizontal video from one script and one taste
  profile, with every cut on a downbeat. No footage, no timeline, no editor.</p>
  <figure class="demo">
    <video src="${u('assets/video/demo.mp4')}" poster="${u('assets/img/demo-poster.webp')}"
           autoplay muted loop playsinline preload="metadata"
           aria-label="Twenty-six seconds of a rendered stingo film: titles animating word by word, a statistic, and a two-column comparison."></video>
    <figcaption>26 seconds, silent. <a href="${GITHUB}/releases/latest">Download the full film with sound</a>, vertical or horizontal.</figcaption>
  </figure>
</section>

<section class="section wide">
  <h2>Why a model can write this at all</h2>
  <p>Because there is nothing to drag. A scene is a few lines of YAML, and the
  frame beside it is what those exact lines produce. Nothing is positioned by
  hand, so nothing has to be nudged — by you or by an agent.</p>

  <div class="io">
    <div class="pane">
      <div class="pane-head"><i class="on"></i><i></i><i></i> video.yaml</div>
      <figure class="code" data-lang="yaml">${hl(scene, 'yaml')}</figure>
    </div>
    <div class="pane">
      <div class="pane-head"><i></i><i></i><i class="on"></i> frame 690 · 23.00s</div>
      <img src="${u('assets/img/hero-code.webp')}" width="1400" height="788" loading="lazy" decoding="async"
           alt="The frame those lines of YAML produce.">
    </div>
  </div>
</section>

<section class="section wide">
  <h2>Change the taste, not the script</h2>
  <p>The script never names a colour. The taste profile never names your topic.
  These three frames are the same nine lines of YAML, rendered against three
  profiles — one of them derived from a single brand colour by
  <code>stingo taste "#ff7a18"</code>.</p>

  <div class="three">
    <figure class="swatch">
      <img src="${u('assets/img/taste-bootdev.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same scene in a violet palette.">
      <figcaption><b>Boot Camp</b><span>snappy · bar</span></figcaption>
    </figure>
    <figure class="swatch">
      <img src="${u('assets/img/taste-dusk.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same scene in a warm sand palette.">
      <figcaption><b>Dusk</b><span>smooth · free</span></figcaption>
    </figure>
    <figure class="swatch">
      <img src="${u('assets/img/taste-hersie.webp')}" width="860" height="484" loading="lazy" decoding="async"
           alt="The same scene in an amber palette.">
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
  <h2>Written by Claude, start to finish</h2>
  <p>Every line of stingo — the renderer, the beat detection, the tests, this
  page — was written by Claude, Anthropic's coding model, working from
  direction by <a href="https://github.com/aynaash" target="_blank" rel="noopener">Hersi</a>.
  Hersi decides what it should do and what good means; Claude does the building.</p>
  <div class="claims">
    <div>
      <h3>The measurements are real</h3>
      <p>585&nbsp;ms to 33&nbsp;ms a frame, and 7× on the decode path, were
      measured on the machine — and one “optimisation” was reverted when a clean
      re-measurement showed it made renders slower.</p>
    </div>
    <div>
      <h3>The tests are real</h3>
      <p>CI typechecks and runs the suite on Linux and macOS with ffmpeg
      installed, then plans every example and renders stills and a clip end to
      end.</p>
    </div>
    <div>
      <h3>It is still young software</h3>
      <p>Being model-written makes it neither more nor less trustworthy than any
      other new project. Read the code, and open an issue when it renders
      something wrong.</p>
    </div>
  </div>
</section>

<section class="section wrap">
  <h2>Start</h2>
  <figure class="code" data-lang="bash">${hl(`git clone ${GITHUB.replace('https://', '')}
cd stingo && bun install

# your agent picks up .mcp.json from the repository — then just ask it.
# or do it yourself:
bun stingo render examples/goroutines/video.yaml`, 'bash')}</figure>
  <p>Needs Bun 1.3 or newer and ffmpeg on your <code>PATH</code>.
  <a href="${u('mcp')}">Connect an agent</a> ·
  <a href="${u('start')}">write one by hand</a> ·
  <a href="${u('roadmap')}">where this is going</a>.</p>
</section>

${footer(base)}
</body></html>`;
}
