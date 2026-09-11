import { Resvg } from '@resvg/resvg-js';

/** Full-frame feTurbulence costs ~1.5s per frame at 1080x1920 because it is a
 *  per-pixel convolution. Rendering one small noise tile once and repeating it
 *  as a pattern is visually equivalent and effectively free. */
const cache = new Map<string, string>();

export function grainTile(size = 180, seed = 11, freq = 0.82): string {
  const key = `${size}:${seed}:${freq}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <filter id="n" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="3" seed="${seed}" stitchTiles="stitch" result="t"/>
      <feColorMatrix in="t" type="saturate" values="0"/>
    </filter>
    <rect width="${size}" height="${size}" filter="url(#n)"/>
  </svg>`;
  const png = new Resvg(svg, { font: { loadSystemFonts: false } }).render().asPng();
  const uri = `data:image/png;base64,${png.toString('base64')}`;
  cache.set(key, uri);
  return uri;
}

/** A <pattern> that tiles the cached grain across any size. */
export function grainPattern(id: string, size = 180, seed = 11): string {
  return `<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
    <image href="${grainTile(size, seed)}" width="${size}" height="${size}"/></pattern>`;
}
