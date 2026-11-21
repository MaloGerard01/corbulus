/**
 * Textures du brouillard, générées par calcul (sans image ni librairie) :
 * fonctions pures, identiques sur la TV et dans l'aperçu du MJ.
 */

/** Teinte de la fumée du brouillard de guerre dans ses creux (RVB, 0–1). */
export const FOG_DARK = [0.4, 0.4, 0.41] as const;
/** Teinte de la fumée sur ses nappes les plus claires (RVB, 0–1). */
export const FOG_LIGHT = [0.7, 0.7, 0.71] as const;

/**
 * Opacité d'une empreinte du pinceau à la distance `r` de son centre (0 au
 * centre, 1 au bord du fondu). Pleine dans le cœur (`r ≤ core`), puis chute
 * en douceur jusqu'à 0 : aucune marche, ni au cœur, ni au bord.
 *
 * Les empreintes d'un tracé se combinent par maximum : ce profil est donc
 * exactement celui du bord du tracé.
 */
export function brushAlpha(r: number, core: number): number {
  if (r >= 1) return 0;
  if (r <= core) return 1;
  return 1 - smoothstep((r - core) / (1 - core));
}

/** Pixels RGBA d'une empreinte : blanc, opacité selon `brushAlpha`. */
export function brushPixels(size: number, core: number): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const half = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - half, y + 0.5 - half) / half;
      const i = (y * size + x) * 4;
      pixels[i] = pixels[i + 1] = pixels[i + 2] = 255;
      pixels[i + 3] = Math.round(brushAlpha(r, core) * 255);
    }
  }
  return pixels;
}

/**
 * Fumée du brouillard de guerre (pixels RGBA opaques, raccordables), dans
 * l'esprit d'une photo de fumée : grandes nappes douces, volutes moyennes,
 * grain cotonneux et fines traînées claires par endroits, peu contrasté.
 *
 * - rouge : teinte, de `FOG_DARK` (0) à `FOG_LIGHT` (1) ;
 * - vert : densité des grandes nappes (0–1), qui fait onduler les bords.
 *
 * Toutes les couches sont des bruits fractals périodiques, certaines lues à
 * des coordonnées déformées par d'autres (volutes plutôt que taches rondes).
 */
export function fogSmokePixels(size: number): Uint8ClampedArray<ArrayBuffer> {
  let pixels = smokeCache.get(size);
  if (!pixels) {
    pixels = computeSmoke(size);
    smokeCache.set(size, pixels);
  }
  return pixels;
}

/** Calculée une fois par fenêtre (quelques centaines de ms), puis réutilisée. */
const smokeCache = new Map<number, Uint8ClampedArray<ArrayBuffer>>();

/** Côté de la grille réduite des couches lentes de la fumée. */
const COARSE_CELLS = 128;
/** Couches lentes, dans la grille réduite : nappes, zones de traînées, tourbillons et déformation. */
const SHEET = 0;
const PATCHES = 1;
const SWIRL_X = 2;
const SWIRL_Y = 3;
const WARP_X = 4;
const WARP_Y = 5;
const COARSE_CHANNELS = 6;

function computeSmoke(size: number): Uint8ClampedArray<ArrayBuffer> {
  const coarse = coarseSmokeLayers();

  // Couches fines, à chaque pixel.
  const billowsNoise = fractal(23, 5, 6);
  const grainNoise = fractal(29, 3, 12);
  const ridgeNoise = fractal(37, 4, 8);

  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const gy = v * COARSE_CELLS;
    const y0 = Math.floor(gy);
    const ty = gy - y0;
    const row0 = y0 * COARSE_CELLS;
    const row1 = ((y0 + 1) % COARSE_CELLS) * COARSE_CELLS;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const gx = u * COARSE_CELLS;
      const x0 = Math.floor(gx);
      const tx = gx - x0;
      const x1 = (x0 + 1) % COARSE_CELLS;
      // Les quatre points voisins de la grille réduite.
      const a = (row0 + x0) * COARSE_CHANNELS;
      const b = (row0 + x1) * COARSE_CHANNELS;
      const c = (row1 + x0) * COARSE_CHANNELS;
      const d = (row1 + x1) * COARSE_CHANNELS;
      const slow = (channel: number) =>
        lerp(
          lerp(coarse[a + channel], coarse[b + channel], tx),
          lerp(coarse[c + channel], coarse[d + channel], tx),
          ty,
        );

      const sheet = slow(SHEET);
      const billows = billowsNoise(u + 0.5 * slow(WARP_X), v + 0.5 * slow(WARP_Y));
      const grain = grainNoise(u, v);
      // Traînées : crêtes fines d'un bruit doublement déformé, seulement par endroits.
      const ridge = 1 - Math.abs(2 * ridgeNoise(u + 0.6 * slow(SWIRL_X), v + 0.6 * slow(SWIRL_Y)) - 1);
      const wisps = ridge ** 9 * slow(PATCHES);

      const shade =
        0.5 + 0.75 * (sheet - 0.5) + 0.7 * (billows - 0.5) + 0.4 * (grain - 0.5) + 0.13 * wisps;
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(clamp01(shade) * 255);
      pixels[i + 1] = Math.round(smoothstep((sheet - 0.3) / 0.4) * 255);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

/**
 * Couches lentes de la fumée (au plus 16 cellules par motif), calculées sur
 * une grille réduite et périodique : lues ensuite par interpolation, sans
 * différence visible et bien plus vite qu'à chaque pixel.
 */
function coarseSmokeLayers(): Float32Array {
  const warpX = fractal(101, 3, 2);
  const warpY = fractal(202, 3, 2);
  const sheets = fractal(11, 3, 3);
  const patches = fractal(55, 3, 3);
  const swirlX = fractal(303, 3, 4);
  const swirlY = fractal(404, 3, 4);

  const layers = new Float32Array(COARSE_CELLS * COARSE_CELLS * COARSE_CHANNELS);
  for (let y = 0; y < COARSE_CELLS; y++) {
    for (let x = 0; x < COARSE_CELLS; x++) {
      const u = x / COARSE_CELLS;
      const v = y / COARSE_CELLS;
      const qx = warpX(u, v) - 0.5;
      const qy = warpY(u, v) - 0.5;
      const i = (y * COARSE_CELLS + x) * COARSE_CHANNELS;
      layers[i + SHEET] = sheets(u + 0.35 * qx, v + 0.35 * qy);
      layers[i + PATCHES] = smoothstep((patches(u, v) - 0.38) / 0.24);
      layers[i + SWIRL_X] = swirlX(u + qx, v + qy) - 0.5;
      layers[i + SWIRL_Y] = swirlY(u + qx, v + qy) - 0.5;
      layers[i + WARP_X] = qx;
      layers[i + WARP_Y] = qy;
    }
  }
  return layers;
}

/**
 * `fbm` préparé pour de nombreux appels : les réseaux de chaque octave sont
 * récupérés une fois pour toutes. `fractal(s, o, b)(u, v)` vaut `fbm(u, v, s, o, b)`.
 */
export function fractal(seed: number, octaves: number, basePeriod = 2): (u: number, v: number) => number {
  const periods: number[] = [];
  const weights: number[] = [];
  const tables: Float32Array[] = [];
  let total = 0;
  for (let octave = 0; octave < octaves; octave++) {
    const period = basePeriod * 2 ** octave;
    periods.push(period);
    weights.push(0.5 ** (octave + 1));
    tables.push(lattice(period, seed + octave));
    total += weights[octave];
  }
  return (u, v) => {
    let value = 0;
    for (let octave = 0; octave < octaves; octave++) {
      const period = periods[octave];
      value += weights[octave] * latticeValue(tables[octave], period, u * period, v * period, true);
    }
    return value / total;
  };
}

/**
 * Bruit fractal périodique (0–1) : somme d'octaves de bruit de valeur, la
 * période doublant et le poids diminuant de moitié à chaque octave. La
 * première octave compte `basePeriod` cellules par motif : plus il est grand,
 * plus le grain est fin (sans répétition visible dans le motif).
 * `u` et `v` sont en fraction du motif ; toute valeur est acceptée (périodique).
 * Aussi utilisé pour la fumée des explosions (explosion-textures.ts).
 */
export function fbm(u: number, v: number, seed: number, octaves: number, basePeriod = 2): number {
  let value = 0;
  let total = 0;
  let weight = 0.5;
  let period = basePeriod;
  for (let octave = 0; octave < octaves; octave++) {
    value += weight * valueNoise(u * period, v * period, period, seed + octave);
    total += weight;
    weight /= 2;
    period *= 2;
  }
  return value / total;
}

/** Bruit de valeur sur un réseau périodique (`period` cellules), interpolé sans cassure. */
function valueNoise(x: number, y: number, period: number, seed: number): number {
  return latticeValue(lattice(period, seed), period, x, y, true);
}

/**
 * Valeur au point (`x`, `y`) d'un réseau périodique de `period` × `period`
 * valeurs, interpolée entre les quatre voisins : en courbe quintique (bruit,
 * sans quadrillage visible) ou linéaire (grille déjà lisse).
 */
function latticeValue(
  values: Float32Array,
  period: number,
  x: number,
  y: number,
  smooth: boolean,
): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth ? quintic(x - x0) : x - x0;
  const ty = smooth ? quintic(y - y0) : y - y0;
  let left = x0 % period;
  if (left < 0) left += period;
  let row = y0 % period;
  if (row < 0) row += period;
  const right = left + 1 === period ? 0 : left + 1;
  const top = row * period;
  const bottom = row + 1 === period ? 0 : top + period;

  const upper = lerp(values[top + left], values[top + right], tx);
  const lower = lerp(values[bottom + left], values[bottom + right], tx);
  return lerp(upper, lower, ty);
}

/** Réseaux déjà calculés, par période et graine. */
const lattices = new Map<number, Float32Array>();

/** Valeurs `hash` d'un réseau périodique, calculées une seule fois. */
function lattice(period: number, seed: number): Float32Array {
  const key = seed * 65536 + period;
  let values = lattices.get(key);
  if (!values) {
    values = new Float32Array(period * period);
    for (let y = 0; y < period; y++) {
      for (let x = 0; x < period; x++) values[y * period + x] = hash(x, y, seed);
    }
    lattices.set(key, values);
  }
  return values;
}

/** Valeur pseudo-aléatoire stable (0–1) pour un point du réseau. */
function hash(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Interpolation à dérivées première et seconde nulles aux extrémités : pas de quadrillage visible. */
function quintic(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function smoothstep(t: number): number {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
