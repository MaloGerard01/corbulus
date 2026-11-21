import { fbm } from './fog-textures';

/** Déformation du domaine du bruit de la fumée, en fraction de la texture. */
const PUFF_WARP = 0.3;

/**
 * Opacité du halo à la distance `r` du centre (0 au centre, 1 au bord) :
 * cloche gaussienne ramenée à 0 au bord, sans cassure.
 */
export function glowAlpha(r: number): number {
  if (r >= 1) return 0;
  return Math.exp(-4 * r * r) * (1 - r * r);
}

/**
 * Halo blanc (pixels RGBA), teinté à l'usage : boule de feu, éclair,
 * étincelles, trace de brûlure.
 */
export function glowPixels(size: number): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(size * size * 4);
  forEachPixel(size, (i, r) => {
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
    pixels[i + 3] = Math.round(glowAlpha(r) * 255);
  });
  return pixels;
}

/**
 * Bouffée de fumée (pixels RGBA), teintée à l'usage : disque flou dont
 * l'opacité et la clarté suivent un bruit fractal à domaine déformé (des
 * volutes plutôt qu'un rond uni). Chaque `seed` donne une bouffée différente.
 */
export function puffPixels(size: number, seed: number): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(size * size * 4);
  forEachPixel(size, (i, r, u, v) => {
    // Pleine jusqu'au tiers du rayon, puis s'efface jusqu'au bord.
    const edge = 1 - smoothstep((r - 0.3) / 0.7);
    if (edge === 0) return;

    const du = fbm(u, v, seed + 100, 3) - 0.5;
    const dv = fbm(u, v, seed + 200, 3) - 0.5;
    const density = smoothstep((fbm(u + PUFF_WARP * du, v + PUFF_WARP * dv, seed, 5) - 0.3) / 0.4);

    // Les parties denses sont plus claires : un relief une fois teinté.
    const level = Math.round(255 * (0.7 + 0.3 * density));
    pixels[i] = pixels[i + 1] = pixels[i + 2] = level;
    pixels[i + 3] = Math.round(255 * edge * (0.35 + 0.65 * density));
  });
  return pixels;
}

/**
 * Appelle `paint` pour chaque pixel avec son indice RGBA, sa distance au
 * centre (1 au bord du disque inscrit) et sa position (0–1).
 */
function forEachPixel(
  size: number,
  paint: (index: number, r: number, u: number, v: number) => void,
): void {
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      paint((y * size + x) * 4, r, x / size, y / size);
    }
  }
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}
