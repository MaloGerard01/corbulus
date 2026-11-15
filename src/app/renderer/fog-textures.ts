/**
 * Textures du brouillard, générées par calcul (sans image ni librairie) :
 * fonctions pures, identiques sur la TV et dans l'aperçu du MJ.
 */

/**
 * Gris du brouillard de guerre (0 noir, 1 blanc) : c'est celui qui est peint,
 * et celui des nuages les plus légers.
 */
export const CLOUD_LIGHT = 0.82;
/** Gris des nuages les plus denses. */
export const CLOUD_DARK = 0.6;

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

/** Amplitude de la déformation du domaine, en fraction du motif. */
const WARP = 0.35;

/**
 * Bruit nuageux (0–1) sur un carré de `size` px, raccordable de tous côtés :
 * répété en mosaïque, il ne laisse voir aucune couture.
 *
 * Bruit fractal à domaine déformé : il est lu à des coordonnées elles-mêmes
 * décalées par un autre bruit, ce qui donne des volutes de nuage plutôt
 * qu'une texture granuleuse.
 */
export function cloudNoise(size: number, seed = 11): Float32Array {
  const noise = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const du = fbm(u, v, seed + 100, 3) - 0.5;
      const dv = fbm(u, v, seed + 200, 3) - 0.5;
      noise[y * size + x] = fbm(u + WARP * du, v + WARP * dv, seed, 5);
    }
  }
  return noise;
}

/**
 * Pixels RGBA opaques des nuages : gris continu de `CLOUD_LIGHT` à
 * `CLOUD_DARK`, sans seuil. Combinés au gris peint (`CLOUD_LIGHT`) par le mode
 * de fusion `min`, ils ne nuancent que le brouillard de guerre (ni l'obscurité,
 * ni les zones visibles) ; vers les bords fondus, le brouillard redevient uni.
 */
export function cloudPixels(size: number): Uint8ClampedArray<ArrayBuffer> {
  const noise = cloudNoise(size);
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < noise.length; i++) {
    // Le bruit fractal se concentre autour de 0,5 : on étale le contraste.
    const density = smoothstep((noise[i] - 0.3) / 0.4);
    const level = CLOUD_LIGHT - (CLOUD_LIGHT - CLOUD_DARK) * density;
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = Math.round(level * 255);
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

/**
 * Bruit fractal périodique (0–1) : somme d'octaves de bruit de valeur, la
 * période doublant et le poids diminuant de moitié à chaque octave.
 * `u` et `v` sont en fraction du motif ; toute valeur est acceptée (périodique).
 */
function fbm(u: number, v: number, seed: number, octaves: number): number {
  let value = 0;
  let total = 0;
  let weight = 0.5;
  let period = 2;
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
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = quintic(x - x0);
  const ty = quintic(y - y0);
  const corner = (dx: number, dy: number) =>
    hash(mod(x0 + dx, period), mod(y0 + dy, period), seed);

  const top = lerp(corner(0, 0), corner(1, 0), tx);
  const bottom = lerp(corner(0, 1), corner(1, 1), tx);
  return lerp(top, bottom, ty);
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

function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
