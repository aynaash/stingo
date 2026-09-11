The fastest way to make a video with stingo is to not write one. Connect an
agent, describe what you want, and let it write the script — then **render a
frame and look at it**.

That last part is the whole reason this works. A model writing video it never
sees produces scripts that validate and read badly: a headline that wrapped, a
chart bar invisible against its background, a scene over before anyone could
read it. `stingo_still` returns the PNG itself, so the model can check.

## Connect it

In a clone of the repository, `.mcp.json` is already there — Claude Code picks
it up:

```json
{
  "mcpServers": {
    "stingo": {
      "command": "bun",
      "args": ["run", "packages/mcp/bin/stingo-mcp.ts"]
    }
  }
}
```

From anywhere else, point at the installed binary:

```json
{
  "mcpServers": {
    "stingo": {
      "command": "bunx",
      "args": ["--bun", "stingo-mcp"]
    }
  }
}
```

It speaks MCP over stdio. ffmpeg still has to be on the `PATH`.

[`AGENTS.md`](https://github.com/aynaash/stingo/blob/main/AGENTS.md) in the
repository is written for the agent itself — the loop that works, and the
mistakes worth not making (never put a colour in a script, do not set `dur`
first, look at frames).

## The loop it is built for

1. `stingo_docs` — read how a field actually behaves instead of guessing
2. `stingo_validate` — catch schema errors instantly
3. `stingo_plan` — check the pacing before spending minutes
4. `stingo_still` — render one frame **and look at it**
5. `stingo_render` — only once the frames read correctly

Steps 3 and 4 are the ones that matter. They cost a second or two and catch the
things a schema cannot: a line too long for the frame, a chart whose highlighted
bar is invisible, a scene that is over before it can be read.

## Tools

| Tool | |
|---|---|
| `stingo_docs` | fetch a documentation page as markdown |
| `stingo_blocks` | the registered scene types and what they take |
| `stingo_validate` | parse a script; report the resolved document or exact errors |
| `stingo_plan` | the resolved timeline, in seconds and in beats |
| `stingo_still` | render one frame, **returned as an image** |
| `stingo_render` | render the MP4 |
| `stingo_takes` | inspect camera takes: resolution, fps, length, audio |
| `stingo_beats` | tempo, downbeat, onsets, loudness of a track |
| `stingo_tastes` | list built-in taste profiles |
| `stingo_derive_taste` | derive a full profile from one brand colour |
| `stingo_audit_taste` | check a profile against the contrast floors |

Every tool that takes a script accepts either `path` (a file) or `source`
(inline YAML). Inline source is written to a scratch file inside `baseDir`, so
relative references — `./taste.json`, `takes/01.mp4` — resolve exactly as they
would on disk.

## Guards worth knowing

`stingo_render` refuses films longer than ten minutes unless you raise
`maxSeconds` deliberately, and defaults to `draft: true`. Rendering is the
expensive operation in this system and an agent should be nudged toward stills.

`stingo_still` accepts `noCamera: true`, so a script whose footage does not
exist yet still produces a frame — with the camera box drawn as a placeholder
carrying its source timecode.

## Example

```
stingo_still {
  source: |
    title: From an agent
    canvas: { preset: horizontal, fps: 30 }
    taste: bootdev
    scenes:
      - block: stat
        value: "7x"
        label: faster
        sub: Cropping before scaling, not after.
  at: 2.0
}
```

Returns the frame as a PNG, plus which scene it landed in.

## Machine-readable documentation

Outside MCP, the documentation is published for language models directly:

- [`/llms.txt`](https://aynaash.github.io/stingo/llms.txt) — an index, in the
  llms.txt convention
- [`/llms-full.txt`](https://aynaash.github.io/stingo/llms-full.txt) — every
  page inlined, one fetch
- every page as markdown at its own path, e.g.
  [`/camera.md`](https://aynaash.github.io/stingo/camera.md)
