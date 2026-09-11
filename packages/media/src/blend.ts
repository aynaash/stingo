/** Composite a premultiplied RGBA layer *underneath* an existing frame.
 *
 *  resvg hands back premultiplied pixels, so source-over is
 *  `dst + src * (1 - dst.a)` — one multiply and one add per channel, with no
 *  division anywhere. The frame is opaque afterwards, which is what the
 *  encoder expects.
 *
 *  `frame` is mutated in place and returned. */
export function blendUnder(
  frame: Buffer, fw: number, fh: number,
  layer: Buffer, lw: number, lh: number,
  x: number, y: number,
  /** optional 0..255 coverage mask over the layer, for rounded or circular framing */
  mask?: Uint8Array,
): Buffer {
  const x0 = Math.max(0, x), y0 = Math.max(0, y);
  const x1 = Math.min(fw, x + lw), y1 = Math.min(fh, y + lh);
  if (x1 <= x0 || y1 <= y0) return frame;

  for (let fy = y0; fy < y1; fy++) {
    const ly = fy - y;
    let fi = (fy * fw + x0) * 4;
    let li = (ly * lw + (x0 - x)) * 4;
    let mi = ly * lw + (x0 - x);
    for (let fx = x0; fx < x1; fx++, fi += 4, li += 4, mi++) {
      const da = frame[fi + 3]!;
      if (da === 255) continue;                 // fully covered by the SVG above
      const inv = 255 - da;
      let sa = layer[li + 3]!;
      let r = layer[li]!, g = layer[li + 1]!, b = layer[li + 2]!;
      if (mask) {
        const m = mask[mi]!;
        if (m === 0) continue;
        if (m !== 255) { r = (r * m) / 255; g = (g * m) / 255; b = (b * m) / 255; sa = (sa * m) / 255; }
      }
      frame[fi] = clamp(frame[fi]! + (r * inv) / 255);
      frame[fi + 1] = clamp(frame[fi + 1]! + (g * inv) / 255);
      frame[fi + 2] = clamp(frame[fi + 2]! + (b * inv) / 255);
      frame[fi + 3] = clamp(da + (sa * inv) / 255);
    }
  }
  return frame;
}

/** Paint every still-transparent pixel with a flat colour, so a frame that the
 *  camera did not fully cover still leaves the encoder something opaque. */
export function flattenOnto(frame: Buffer, n: number, rgb: [number, number, number]): Buffer {
  for (let i = 0; i < n * 4; i += 4) {
    const a = frame[i + 3]!;
    if (a === 255) continue;
    const inv = 255 - a;
    frame[i] = clamp(frame[i]! + (rgb[0] * inv) / 255);
    frame[i + 1] = clamp(frame[i + 1]! + (rgb[1] * inv) / 255);
    frame[i + 2] = clamp(frame[i + 2]! + (rgb[2] * inv) / 255);
    frame[i + 3] = 255;
  }
  return frame;
}

// rounds rather than truncates: truncation biases every blended pixel darker,
// and over a full-frame take that reads as a visible gamma shift
const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0);
