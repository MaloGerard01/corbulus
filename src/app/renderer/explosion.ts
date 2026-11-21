import type { CellPoint } from './layout';

/**
 * Explosion vue du dessus, en particules : trace de brûlure, fumée qui
 * s'étale et se dissipe, boule de feu, étincelles, éclair, plus une onde de
 * choc. Fonctions pures : le calque d'effets crée un sprite par particule et
 * l'anime avec `particleFrame`. Tout est en cases, proportionnel au rayon.
 */

/** Sortes de particules, dans l'ordre d'empilement (du dessous au dessus). */
export type ParticleKind = 'scorch' | 'smoke' | 'fire' | 'spark' | 'flash';

/** Particules lumineuses : leurs couleurs s'additionnent (lueur). */
export const GLOWING_KINDS: ReadonlySet<ParticleKind> = new Set(['fire', 'spark', 'flash']);

/** Nombre de bouffées de fumée différentes (textures). */
export const PUFF_VARIANTS = 3;

export interface Particle {
  kind: ParticleKind;
  /** Départ après le début de l'explosion, en ms. */
  delay: number;
  /** Durée de vie, en ms. */
  life: number;
  /** Position de départ et d'arrivée, en cases depuis le centre. */
  from: CellPoint;
  to: CellPoint;
  /** Diamètre au départ et à l'arrivée, en cases. */
  size0: number;
  size1: number;
  /** Allongement dans le sens de `rotation` (traînée des étincelles). */
  stretch: number;
  rotation: number;
  /** Rotation ajoutée sur toute la vie, en radians. */
  spin: number;
  /** Bouffée de fumée à utiliser (0 à `PUFF_VARIANTS` − 1). */
  variant: number;
}

/** État d'une particule à un instant : position et taille en cases. */
export interface ParticleFrame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  alpha: number;
  /** Couleur 0xRRGGBB. */
  tint: number;
}

/** Onde de choc : anneau qui s'élargit, en cases. */
export interface ShockwaveFrame {
  radius: number;
  width: number;
  alpha: number;
}

export const SHOCKWAVE_MS = 500;
export const SHOCKWAVE_COLOR = 0xffe2a0;

type Ramp = readonly (readonly [at: number, color: number])[];

/** Du blanc-jaune brûlant au rouge sombre. */
const FIRE_RAMP: Ramp = [
  [0, 0xfff6c8],
  [0.2, 0xffc24a],
  [0.5, 0xff6a1a],
  [0.8, 0xa3290c],
  [1, 0x3a1206],
];
/** Éclairée par le feu au début, puis grise, plus claire en se dissipant. */
const SMOKE_RAMP: Ramp = [
  [0, 0x7a4a2a],
  [0.15, 0x3b3633],
  [0.6, 0x4d4d4d],
  [1, 0x6b6b6b],
];
const SPARK_RAMP: Ramp = [
  [0, 0xfff0b0],
  [1, 0xff7a1a],
];

interface Behaviour {
  /** Avancement du déplacement et de la croissance selon l'âge (0–1). */
  ease: (k: number) => number;
  alpha: (k: number) => number;
  colors: Ramp;
}

const BEHAVIOURS: Record<ParticleKind, Behaviour> = {
  scorch: {
    ease: (k) => k,
    alpha: (k) => 0.55 * Math.min(1, k / 0.04) * (1 - smoothstep((k - 0.6) / 0.4)),
    colors: [[0, 0x140c08]],
  },
  smoke: {
    ease: easeOut,
    alpha: (k) => 0.85 * Math.min(1, k / 0.08) * (1 - smoothstep((k - 0.35) / 0.65)),
    colors: SMOKE_RAMP,
  },
  fire: {
    ease: easeOut,
    alpha: (k) => Math.min(1, k / 0.1) * (1 - smoothstep((k - 0.4) / 0.6)),
    colors: FIRE_RAMP,
  },
  spark: {
    ease: easeOut,
    alpha: (k) => 1 - k * k,
    colors: SPARK_RAMP,
  },
  flash: {
    ease: easeOut,
    alpha: (k) => (1 - k) ** 2,
    colors: [[0, 0xfff7e0]],
  },
};

const FIRE_COUNT = 18;
const SPARK_COUNT = 22;
const SMOKE_COUNT = 24;

/**
 * Particules d'une explosion de rayon `radius` (en cases), dans l'ordre
 * d'empilement. L'essentiel tient dans le rayon ; étincelles, fumée et onde
 * de choc le dépassent un peu. Chaque appel donne une explosion différente.
 */
export function explosionParticles(radius: number, random: () => number = Math.random): Particle[] {
  const r = Math.max(0.1, radius);
  const between = (min: number, max: number) => min + (max - min) * random();
  const turn = () => between(0, 2 * Math.PI);
  const at = (angle: number, distance: number): CellPoint => ({
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  });
  const center: CellPoint = { x: 0, y: 0 };
  const particle = (kind: ParticleKind, values: Partial<Particle>): Particle => ({
    kind,
    delay: 0,
    life: 1000,
    from: center,
    to: center,
    size0: r,
    size1: r,
    stretch: 1,
    rotation: 0,
    spin: 0,
    variant: 0,
    ...values,
  });

  const particles: Particle[] = [
    particle('scorch', { delay: 60, life: 4500, size0: 1.5 * r, size1: 1.6 * r }),
  ];

  for (let i = 0; i < SMOKE_COUNT; i++) {
    const angle = turn();
    particles.push(
      particle('smoke', {
        delay: between(60, 300),
        life: between(2400, 3600),
        from: at(angle, between(0.05, 0.35) * r),
        to: at(angle + between(-0.3, 0.3), between(0.45, 0.9) * r),
        size0: between(0.35, 0.55) * r,
        size1: between(0.7, 1.1) * r,
        rotation: turn(),
        spin: between(-0.5, 0.5),
        variant: Math.floor(random() * PUFF_VARIANTS) % PUFF_VARIANTS,
      }),
    );
  }

  for (let i = 0; i < FIRE_COUNT; i++) {
    const angle = turn();
    const size0 = between(0.45, 0.7) * r;
    particles.push(
      particle('fire', {
        delay: between(0, 90),
        life: between(450, 850),
        from: at(angle, between(0, 0.15) * r),
        to: at(angle, between(0.2, 0.55) * r),
        size0,
        size1: size0 * 1.35,
        rotation: turn(),
      }),
    );
  }

  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = turn();
    const size0 = between(0.07, 0.12) * r;
    particles.push(
      particle('spark', {
        delay: between(20, 120),
        life: between(500, 1000),
        from: at(angle, 0.1 * r),
        to: at(angle, between(0.85, 1.2) * r),
        size0,
        size1: size0 * 0.6,
        stretch: 3.5,
        rotation: angle,
      }),
    );
  }

  particles.push(particle('flash', { life: 260, size0: 0.8 * r, size1: 2.6 * r }));
  return particles;
}

/** État de la particule `elapsed` ms après le début de l'explosion (`null` : invisible). */
export function particleFrame(particle: Particle, elapsed: number): ParticleFrame | null {
  const k = (elapsed - particle.delay) / particle.life;
  if (k < 0 || k >= 1) return null;

  const behaviour = BEHAVIOURS[particle.kind];
  const progress = behaviour.ease(k);
  const size = lerp(particle.size0, particle.size1, progress);
  return {
    x: lerp(particle.from.x, particle.to.x, progress),
    y: lerp(particle.from.y, particle.to.y, progress),
    width: size * particle.stretch,
    height: size,
    rotation: particle.rotation + particle.spin * k,
    alpha: behaviour.alpha(k),
    tint: rampColor(behaviour.colors, k),
  };
}

/** Onde de choc `elapsed` ms après le début (`null` : terminée). */
export function shockwaveFrame(radius: number, elapsed: number): ShockwaveFrame | null {
  const k = elapsed / SHOCKWAVE_MS;
  if (k < 0 || k >= 1) return null;
  return {
    radius: radius * (0.15 + 1.05 * easeOut(k)),
    width: radius * (0.1 * (1 - k) + 0.02),
    alpha: 0.7 * (1 - k),
  };
}

/** Durée totale de l'explosion, en ms (jusqu'à la disparition de la dernière particule). */
export function explosionDuration(particles: readonly Particle[]): number {
  return particles.reduce((end, p) => Math.max(end, p.delay + p.life), SHOCKWAVE_MS);
}

/** Couleur du dégradé `ramp` à l'avancement `k` (0–1), composante par composante. */
export function rampColor(ramp: Ramp, k: number): number {
  const next = ramp.findIndex(([at]) => at >= k);
  if (next <= 0) return ramp[next === 0 ? 0 : ramp.length - 1][1];

  const [at0, color0] = ramp[next - 1];
  const [at1, color1] = ramp[next];
  const t = (k - at0) / (at1 - at0);
  const channel = (shift: number) =>
    Math.round(lerp((color0 >> shift) & 0xff, (color1 >> shift) & 0xff, t)) << shift;
  return channel(16) | channel(8) | channel(0);
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function smoothstep(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
