# Contributing

Thanks for looking. This is a young project and the shape of it is still moving,
so the most useful thing you can send is a video that came out wrong.

## Getting set up

```bash
git clone https://github.com/aynaash/stingo
cd stingo
bun install
bun test
bun stingo render examples/goroutines/video.yaml --draft
```

You need **Bun ≥ 1.3** and **ffmpeg ≥ 6** on your `PATH`. ffmpeg is not optional
— it decodes footage, mixes audio and encodes the MP4.

`bun run typecheck` and `bun test` are what CI runs. Both should pass before you
open a PR.

## The fastest useful contribution

A script that renders badly. Open an issue with the `video.yaml`, the taste
profile, and a still (`stingo still script.yaml --at 4.2 -o bad.png`). Layout
bugs are hard to imagine and obvious to look at.

## How the pieces fit

Read [`README.md`](./README.md) first — the "Why it is built this way" section
is the design, not marketing. The constraints that shape every change:

- **A frame is a pure function of its index.** Nothing may carry over between
  frames. If you find yourself wanting state across frames, the answer is to
  derive it from the frame number instead. This is what makes scrubbing,
  parallel rendering and deterministic output work, and it is not negotiable.
- **No full-frame SVG filters.** `feGaussianBlur` over two megapixels costs
  ~9.5 seconds a frame. Per-pixel effects belong in a precomputed lookup applied
  to the RGBA buffer, the way `TexturePass` does it.
- **Taste profiles set parameters; the house sets relationships.** A taste says
  "orange, snappy, airy". Type ratios, contrast floors and spacing rhythm live
  in `themes/house.ts` and are not the taste's to override. That is why a badly
  chosen palette still produces a readable video.

## Adding a block

A block is a function from `(scene, ctx) → El`. Four things make one land:

1. **Size everything from `ctx.stage`**, never from raw pixel numbers. That is
   what makes a block work in portrait, landscape and square, and inside a
   split-screen panel, without knowing which it is in.
2. **Use `T.*` for type sizes** so it sits on the same modular scale as
   everything else.
3. **Animate with `lifecycle()`**, so the taste's motion personality applies.
4. **Declare it with `defineBlock`** — one call, in one file, carrying its
   fields, its `duration`, its default `broll` and its `render`. The scene
   schema, the renderer table and the duration rules are all derived from what
   is registered; there is no central list to edit.

Importing the file is what registers it, so add `import './yourblock';` to
`packages/blocks/src/registry.ts` and the built-in set picks it up everywhere at
once — YAML, the planner, the preview and `stingo blocks`. Give it a `broll`
default so it never sits on flat colour. The Blocks page in the docs has a
worked example.

## Tests

`bun test`. Prefer tests that pin behaviour someone could plausibly break:
geometry, timing, colour maths, schema defaults. Tests that need real media
generate it with ffmpeg into a temp directory — see `test/camera.test.ts`.

Rendering tests should assert on pixels or numbers, not on exact SVG strings,
except where the SVG structure *is* the contract (layer order and masking).

## Commits and PRs

Explain **why** in the commit body, not what — the diff already says what. If a
change is a performance claim, put the measurement in the message, and say what
machine it was measured on.

Small PRs get read. A PR that changes the renderer and adds three blocks and
reformats a package does not.

## Licence

stingo is AGPL-3.0-only. By contributing you agree your contribution is
licensed under the same terms. See [NOTICE](./NOTICE) for why that licence.
