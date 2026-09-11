# Building stingo — the launch video

The script for the video about this tool, written in this tool.

Two cuts of one release:

| File | Canvas | Length | For |
|---|---|---|---|
| `video.yaml` | 1920×1080 | ~8 min with takes | YouTube |
| `reel.yaml` | 1080×1920 | ~50 s | Shorts, Reels, TikTok |
| `taste.json` | — | — | shared look, so both read as one release |

Both reference takes under `takes/` that are not in the repository. That is the
point of the example: a script is finished, planned and previewed *before* the
footage exists.

```bash
# the cut, with no footage at all
bun stingo plan examples/building-stingo/video.yaml

# a watchable rough — camera scenes draw a placeholder with a timecode
bun stingo render examples/building-stingo/video.yaml --no-camera

# once takes exist
bun stingo takes  examples/building-stingo/video.yaml   # check them first
bun stingo render examples/building-stingo/video.yaml
```

See [RECORDING.md](./RECORDING.md) for what to shoot and how to frame it.

## What this example demonstrates

- **All three camera layouts.** `full` for delivery, `pip` over code, `split`
  beside a comparison and a chart.
- **Camera as a modifier.** `camera:` sits on `code`, `list`, `compare` and
  `chart` scenes, not only on `camera` scenes.
- **Planning without footage.** Every command works with `takes/` empty.
- **Takes driving pace.** Delete a camera scene's `dur:` and it runs as long as
  the take.
