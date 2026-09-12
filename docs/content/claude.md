Every line of stingo was written by Claude — Anthropic's coding model — working
from direction by [Hersi](https://github.com/aynaash). The renderer, the beat
detection, the font parser, the tests, this sentence. Not one line was typed by
a human.

That is not a disclaimer at the bottom of a page. It is the most interesting
thing about the project, and burying it would be the only dishonest move
available.

## What was actually divided

**Hersi decided** what it should do, what "good" meant, what to cut, when
something looked wrong, and when a measurement was not to be trusted.

**Claude did** the building: architecture, implementation, tests, performance
work, documentation, the launch video's script, and the art direction.

That division is worth being precise about, because "AI wrote it" is usually
doing a lot of hiding. Nobody prompted once and got a video renderer. The
conversation ran for a night, and most of it was disagreement about what the
thing should be.

## Where the evidence is

Every commit message says what changed and why, in full sentences. Each one
carries a session link. If you want to know how a decision was reached, the
history is the record — not a summary of it afterwards.

```bash
git clone https://github.com/aynaash/stingo
git log --format='%h %s'
```

## Three things this does not mean

**It does not mean the measurements are invented.** They were taken on a real
machine. When the numbers disagreed with the story, the story lost: an
"optimisation" that halved the render worker count was committed on a noisy
measurement and reverted an hour later when a clean run showed 45 s, 49 s and
65 s for 8, 4 and 2 workers. More workers was faster. The commit that undoes it
says so.

**It does not mean the code is unreviewed.** It typechecks and runs 240-odd
tests on Linux and macOS with ffmpeg installed, then plans every example and
renders stills and a clip end to end. Three separate review passes went over the
frames, the docs and the published package before release.

**It does not mean it is finished.** It is young software with bugs in it, the
same as any other young software. Launch night alone turned up an entire block
type rendering a blank window, published types quietly degrading to `any`, and
an unknown command exiting zero. All three failed *silently*, which is the
expensive kind.

## What a model actually got wrong

Worth stating, because "written by AI" usually arrives without a list.

- **Claimed a speedup that was not there.** See above. The fix was measuring
  again on an unloaded machine.
- **Verified a package the wrong way.** The published tarball was installed with
  `bun`, which does not apply npm's manifest rewriting, so a bug that deleted
  both command-line binaries passed as "verified". Reinstalling with `npm` is
  what caught it.
- **Broke local development while fixing packaging.** A binary was pointed at
  the bundle instead of the source, so for three attempts every local edit
  silently ran stale code.
- **Wrote a page that contradicted itself.** The landing page asserted the YAML
  beside the hero was the scene that produced it. It was not, and nobody noticed
  until the live site was screenshotted.

Each of those was found by checking, not by intuition. That is the part worth
copying, whoever is writing the code.

## The tool is also built for this

The other half of the story: stingo has an
[MCP server](mcp), and its most important tool renders a single frame and
returns the **image**, not a path. A model that can see the frame it just wrote
catches what a schema cannot — a headline that wrapped, a chart bar invisible
against its background, a scene over before anyone could read it.

Writing video without ever seeing one produces scripts that validate and look
wrong. That applies to models and people equally.

## If this bothers you

That is a reasonable position, and the licence is [AGPL-3.0](https://github.com/aynaash/stingo/blob/main/LICENSE),
so nothing stops you reading every line before you trust any of it. That was
rather the point of saying it out loud.
