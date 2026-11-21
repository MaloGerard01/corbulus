import { brushAlpha, fbm, fogSmokePixels, fractal } from './fog-textures';

describe('brushAlpha', () => {
  it('est plein dans le cœur et nul au bord du fondu', () => {
    for (const core of [0, 0.3, 0.6]) {
      expect(brushAlpha(0, core)).toBe(1);
      expect(brushAlpha(core, core)).toBe(1);
      expect(brushAlpha(1, core)).toBe(0);
    }
  });

  it('décroît progressivement dans le fondu, sans marche', () => {
    for (const core of [0, 0.3, 0.6]) {
      const samples = Array.from({ length: 101 }, (_, i) => brushAlpha(i / 100, core));
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
        expect(samples[i - 1] - samples[i]).toBeLessThan(0.06);
      }
    }
  });

  it('est à mi-opacité au milieu du fondu', () => {
    // Cœur sur la moitié du rayon : le fondu va de 0,5 à 1.
    expect(brushAlpha(0.75, 0.5)).toBeCloseTo(0.5);
  });
});

describe('fractal', () => {
  it('donne le même bruit que fbm, préparé pour de nombreux appels', () => {
    const noise = fractal(23, 5, 6);
    for (const [u, v] of [[0, 0], [0.13, 0.71], [0.5, 0.25], [-0.2, 1.3]]) {
      expect(noise(u, v)).toBeCloseTo(fbm(u, v, 23, 5, 6), 6);
    }
  });
});

describe('fogSmokePixels', () => {
  const size = 64;
  const pixels = fogSmokePixels(size);
  const channel = (offset: number) => [...pixels.filter((_, i) => i % 4 === offset)];
  const shadeAt = (x: number, y: number) => pixels[(y * size + x) * 4];

  it('nuance la teinte en continu, sans écraser les extrêmes', () => {
    const shades = channel(0);
    // Un dégradé de fumée, pas des taches sur un fond uni.
    expect(new Set(shades).size).toBeGreaterThan(60);
    // Peu contrastée : l'essentiel reste loin du noir et du blanc de la texture.
    const clipped = shades.filter((s) => s === 0 || s === 255).length;
    expect(clipped / shades.length).toBeLessThan(0.02);
  });

  it('se raccorde sans couture quand on la répète, dans les deux sens', () => {
    let seam = 0;
    let neighbours = 0;
    for (let i = 0; i < size; i++) {
      seam = Math.max(seam, Math.abs(shadeAt(size - 1, i) - shadeAt(0, i)), Math.abs(shadeAt(i, size - 1) - shadeAt(i, 0)));
      for (let j = 1; j < size; j++) {
        neighbours = Math.max(
          neighbours,
          Math.abs(shadeAt(j, i) - shadeAt(j - 1, i)),
          Math.abs(shadeAt(i, j) - shadeAt(i, j - 1)),
        );
      }
    }
    expect(seam).toBeLessThanOrEqual(neighbours * 1.5);
  });

  it('range la densité des nappes en vert, et reste opaque', () => {
    expect(new Set(channel(1)).size).toBeGreaterThan(30);
    expect(new Set(channel(3))).toEqual(new Set([255]));
  });

  it('n’est calculée qu’une fois par taille', () => {
    expect(fogSmokePixels(size)).toBe(pixels);
  });
});
