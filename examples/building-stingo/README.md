# Building stingo — the launch video

The video about this tool, written in this tool. It explains itself using
itself, including the parts that broke.

| File | Canvas | Length | For |
|---|---|---|---|
| `video.yaml` | 1920×1080 | 7:25 now, ~8 min with takes | YouTube |
| `reel.yaml` | 1080×1920 | 1:00 | Shorts, Reels, TikTok |
| `taste.json` | — | — | shared look, so both read as one release |

Both reference takes under `takes/` that are not in the repository. That is the
point of the example: the edit is finished, planned and previewable *before* any
footage exists.

```bash
# the cut, with nothing shot
bun stingo plan examples/building-stingo/video.yaml

# a watchable rough — camera scenes draw a placeholder with a timecode
bun stingo render examples/building-stingo/video.yaml --no-camera

# once takes exist
bun stingo takes  examples/building-stingo/video.yaml   # check them first
bun stingo render examples/building-stingo/video.yaml
```

[RECORDING.md](./RECORDING.md) is the shot list: fourteen takes for the long
video, four for the reel, with framing and sound notes.

## What it covers

The problem with timeline editing · the two-file idea and what the name means ·
deriving a palette from one colour · the pipeline, with no browser in it · why a
frame is a pure function of its index · beat detection · the 585 ms to 33 ms
story · the camera block explaining the shot you are watching · the MCP server
and why a model needs to see a frame · who actually wrote the code · and the
three silent bugs plus npm refusing the name, on launch night.

## What it demonstrates

- **Every block**, including `diagram`, `terminal`, `chart` and `compare`
- **All three camera layouts** — `full` for delivery, `pip` over code, `split`
  beside a comparison
- **Camera as a modifier**, sitting on `code`, `list`, `terminal` and `chart`
  scenes rather than only on `camera` scenes
- **One take feeding several scenes** through `from:`
- **Captions**, burned in with `.srt` and `.vtt` sidecars
- **Planning with no footage at all** — every command works with `takes/` empty
