import {
  PUFF_VARIANTS,
  SHOCKWAVE_MS,
  explosionDuration,
  explosionParticles,
  particleFrame,
  rampColor,
  shockwaveFrame,
  type ParticleKind,
} from './explosion';

/** Générateur pseudo-aléatoire reproductible (mulberry32). */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STACKING: ParticleKind[] = ['scorch', 'smoke', 'fire', 'spark', 'flash'];

describe('explosionParticles', () => {
  it("reste pour l'essentiel dans le rayon", () => {
    const radius = 3;
    for (const particle of explosionParticles(radius, seeded(1))) {
      const reach = Math.hypot(particle.to.x, particle.to.y);
      expect(reach).toBeLessThanOrEqual(1.2 * radius + 1e-9);
      if (particle.kind === 'fire') expect(reach).toBeLessThanOrEqual(0.55 * radius + 1e-9);
    }
  });

  it('est proportionnelle au rayon, sans changer de rythme', () => {
    const small = explosionParticles(2, seeded(7));
    const large = explosionParticles(4, seeded(7));
    large.forEach((particle, i) => {
      expect(particle.to.x).toBeCloseTo(2 * small[i].to.x);
      expect(particle.to.y).toBeCloseTo(2 * small[i].to.y);
      expect(particle.size1).toBeCloseTo(2 * small[i].size1);
      expect(particle.life).toBe(small[i].life);
    });
  });

  it("donne les particules dans l'ordre d'empilement", () => {
    const ranks = explosionParticles(3, seeded(3)).map((p) => STACKING.indexOf(p.kind));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(new Set(ranks).size).toBe(STACKING.length);
  });

  it('choisit des bouffées de fumée existantes', () => {
    const smoke = explosionParticles(3, seeded(4)).filter((p) => p.kind === 'smoke');
    expect(smoke.every((p) => p.variant >= 0 && p.variant < PUFF_VARIANTS)).toBe(true);
  });
});

describe('particleFrame', () => {
  const particles = explosionParticles(3, seeded(5));
  const smoke = particles.find((p) => p.kind === 'smoke')!;

  it('est invisible avant son départ et après sa vie', () => {
    expect(particleFrame(smoke, smoke.delay - 1)).toBeNull();
    expect(particleFrame(smoke, smoke.delay + smoke.life)).toBeNull();
  });

  it("part de son point de départ, transparente, puis grandit en s'éloignant", () => {
    const start = particleFrame(smoke, smoke.delay)!;
    expect(start).toMatchObject({ x: smoke.from.x, y: smoke.from.y, alpha: 0 });

    const later = particleFrame(smoke, smoke.delay + smoke.life / 2)!;
    expect(later.width).toBeGreaterThan(start.width);
    expect(later.alpha).toBeGreaterThan(0);
    expect(Math.hypot(later.x, later.y)).toBeGreaterThan(Math.hypot(start.x, start.y));
  });

  it('allonge les étincelles dans le sens de leur course', () => {
    const spark = particles.find((p) => p.kind === 'spark')!;
    const frame = particleFrame(spark, spark.delay)!;
    const course = Math.hypot(spark.to.x, spark.to.y);

    expect(frame.width).toBeCloseTo(3.5 * frame.height);
    expect(Math.cos(frame.rotation)).toBeCloseTo(spark.to.x / course);
    expect(Math.sin(frame.rotation)).toBeCloseTo(spark.to.y / course);
  });

  it('fait passer le feu du jaune brûlant au rouge sombre', () => {
    const fire = particles.find((p) => p.kind === 'fire')!;
    const red = (elapsed: number) => (particleFrame(fire, elapsed)!.tint >> 16) & 0xff;
    const green = (elapsed: number) => (particleFrame(fire, elapsed)!.tint >> 8) & 0xff;

    expect(particleFrame(fire, fire.delay)!.tint).toBe(0xfff6c8);
    expect(green(fire.delay + fire.life * 0.9)).toBeLessThan(green(fire.delay + fire.life * 0.3));
    expect(red(fire.delay + fire.life * 0.9)).toBeLessThan(0xff);
  });
});

describe('shockwaveFrame', () => {
  it("s'élargit au-delà du rayon en s'effaçant, puis disparaît", () => {
    const start = shockwaveFrame(3, 0)!;
    const end = shockwaveFrame(3, SHOCKWAVE_MS - 1)!;

    expect(start.radius).toBeCloseTo(0.45);
    expect(end.radius).toBeGreaterThan(3);
    expect(end.alpha).toBeLessThan(start.alpha);
    expect(shockwaveFrame(3, SHOCKWAVE_MS)).toBeNull();
  });
});

describe('explosionDuration', () => {
  it("dure jusqu'à la disparition de la dernière particule", () => {
    const particles = explosionParticles(3, seeded(9));
    const total = explosionDuration(particles);

    expect(particles.every((p) => particleFrame(p, total) === null)).toBe(true);
    expect(particles.some((p) => particleFrame(p, total - 1) !== null)).toBe(true);
  });
});

describe('rampColor', () => {
  const ramp = [
    [0, 0x000000],
    [0.5, 0xff8000],
    [1, 0xffffff],
  ] as const;

  it('interpole chaque composante entre les deux couleurs voisines', () => {
    expect(rampColor(ramp, 0.25)).toBe(0x804000);
    expect(rampColor(ramp, 0.75)).toBe(0xffc080);
  });

  it('garde les couleurs des extrémités', () => {
    expect(rampColor(ramp, 0)).toBe(0x000000);
    expect(rampColor(ramp, 1)).toBe(0xffffff);
    expect(rampColor(ramp, 2)).toBe(0xffffff);
  });
});
