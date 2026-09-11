import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** Intrinsic image dimensions, read from the file header.
 *
 *  `render` is a synchronous pure function of frame number, so it cannot await
 *  ffprobe. Every format below states its size in the first few dozen bytes, so
 *  a small header parser keeps sizing sync and costs nothing per frame.
 *  Files are read once and cached for the life of the process. */

export interface ImageInfo { width: number; height: number; mime: string; dataUri: string }

const cache = new Map<string, ImageInfo>();

const MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', avif: 'image/avif',
};

function pngSize(b: Buffer) {
  // 8-byte signature, then the IHDR chunk: length, type, width, height
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

function gifSize(b: Buffer) {
  return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
}

function jpegSize(b: Buffer) {
  // walk the marker segments until a start-of-frame, which carries the size
  let i = 2;
  while (i < b.length - 9) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1]!;
    // SOF0-3, SOF5-7, SOF9-11, SOF13-15 all carry dimensions; DHT/DAC/RST do not
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + b.readUInt16BE(i + 2);
  }
  return null;
}

function webpSize(b: Buffer) {
  const fourcc = b.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (fourcc === 'VP8L') {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    const w = b[24]! | (b[25]! << 8) | (b[26]! << 16);
    const h = b[27]! | (b[28]! << 8) | (b[29]! << 16);
    return { width: w + 1, height: h + 1 };
  }
  return null;
}

function svgSize(text: string) {
  const num = (s?: string) => (s ? parseFloat(s) : NaN);
  const w = num(/\bwidth\s*=\s*["']([\d.]+)/.exec(text)?.[1]);
  const h = num(/\bheight\s*=\s*["']([\d.]+)/.exec(text)?.[1]);
  if (Number.isFinite(w) && Number.isFinite(h)) return { width: w, height: h };
  const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/.exec(text);
  if (vb) return { width: parseFloat(vb[1]!), height: parseFloat(vb[2]!) };
  return null;
}

export function imageInfo(file: string): ImageInfo {
  const hit = cache.get(file);
  if (hit) return hit;

  let buf: Buffer;
  try {
    buf = readFileSync(file);
  } catch {
    throw new Error(`image not found: ${file}`);
  }

  const ext = (file.split('.').pop() ?? '').toLowerCase();
  const mime = MIME[ext] ?? 'application/octet-stream';

  let size: { width: number; height: number } | null = null;
  if (buf.length > 24 && buf.toString('ascii', 1, 4) === 'PNG') size = pngSize(buf);
  else if (buf[0] === 0xff && buf[1] === 0xd8) size = jpegSize(buf);
  else if (buf.toString('ascii', 0, 3) === 'GIF') size = gifSize(buf);
  else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') size = webpSize(buf);
  else if (ext === 'svg') size = svgSize(buf.toString('utf8', 0, 2048));

  if (!size || !size.width || !size.height) {
    throw new Error(
      `could not read the dimensions of ${file} — supported formats are png, jpeg, gif, webp and svg`,
    );
  }

  // resvg decodes png, jpeg, gif and svg in an <image> href. It does not decode
  // webp or avif — and rather than failing it draws nothing at all, so the block
  // renders an empty window and says nothing about why. Transcoding through
  // ffmpeg, which is already a hard requirement, turns a silently blank frame
  // into a correct one. spawnSync keeps this on the synchronous render path.
  let bytes = buf;
  let outMime = mime;
  if (RASTERISE.has(ext)) {
    const png = toPng(file);
    if (png) { bytes = png; outMime = 'image/png'; }
    else {
      console.warn(
        `[image] ${file} is ${ext}, which the renderer cannot draw, and converting it with `
        + 'ffmpeg failed. The image will be blank. Convert it to png or jpeg.',
      );
    }
  }

  const info: ImageInfo = {
    ...size, mime: outMime,
    dataUri: `data:${outMime};base64,${bytes.toString('base64')}`,
  };
  cache.set(file, info);
  return info;
}

/** Formats the rasteriser cannot decode itself. */
const RASTERISE = new Set(['webp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'bmp']);

/** Convert an image to PNG bytes with ffmpeg. Returns null if that fails.
 *  Runs once per file: the result is cached with the rest of the image info. */
function toPng(file: string): Buffer | null {
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file,
      '-frames:v', '1', '-f', 'image2', '-c:v', 'png', 'pipe:1'],
      { maxBuffer: 256 * 1024 * 1024 });
    if (r.status === 0 && r.stdout?.length) return Buffer.from(r.stdout);
  } catch { /* ffmpeg missing or unreadable input — reported by the caller */ }
  return null;
}

/** Fit a source into a box, the way CSS object-fit would. */
export function fitBox(
  src: { width: number; height: number },
  box: { w: number; h: number },
  mode: 'cover' | 'contain',
): { w: number; h: number } {
  const sr = src.width / src.height;
  const br = box.w / box.h;
  const useWidth = mode === 'cover' ? sr < br : sr > br;
  return useWidth ? { w: box.w, h: box.w / sr } : { w: box.h * sr, h: box.h };
}
