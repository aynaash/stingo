# Security

## Reporting

Report vulnerabilities privately through GitHub's
[security advisory form](https://github.com/aynaash/stingo/security/advisories/new).
Please do not open a public issue for anything exploitable.

Expect a first reply within a week. If a report is valid I will tell you the fix
timeline, and you get credit in the advisory unless you ask otherwise.

## What is in scope

stingo shells out to `ffmpeg` and reads files a document points at. The
interesting risks follow from that:

- **Document-controlled paths.** A `video.yaml` can reference arbitrary files
  through `camera.src`, `audio.music`, `audio.vo` and a code block's `file:`.
  Rendering an untrusted document reads whatever those paths resolve to.
- **Values reaching an ffmpeg filtergraph.** Framing numbers are interpolated
  into `-vf` strings. They are schema-validated as bounded numbers, but a way to
  get arbitrary text into a filtergraph would be a real finding.
- **Untrusted media.** Decoding happens in ffmpeg, so a malicious file is mostly
  ffmpeg's problem — but a crash or hang that stingo turns into something worse
  is worth reporting.

## What is not

- **Rendering an untrusted document is not a supported use.** A document is
  code: the `.ts` form imports and executes, and the YAML form reads files of
  its choosing. Treat a `video.yaml` from a stranger exactly as you would treat
  a `Makefile` from a stranger. If you want to render untrusted input, sandbox
  the process — that boundary is yours to draw, not stingo's.
- Denial of service from a deliberately enormous canvas, frame count or
  resolution. Those are yours to bound.
- Vulnerabilities in ffmpeg itself. Report those upstream; keep yours current.

## Supported versions

Pre-1.0: fixes land on `main` and in the next release. There are no backports
to older tags yet.
