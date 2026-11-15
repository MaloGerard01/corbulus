import { CLOUD_DARK, CLOUD_LIGHT, brushAlpha, cloudNoise, cloudPixels } from './fog-textures';

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

describe('cloudNoise', () => {
  const size = 64;
  const noise = cloudNoise(size);
  const at = (x: number, y: number) => noise[y * size + x];

  it('donne le même motif à chaque appel (TV et aperçu identiques)', () => {
    expect(cloudNoise(size)).toEqual(noise);
  });

  it('se raccorde sans couture quand on le répète, dans les deux sens', () => {
    // Après la dernière colonne (ligne) vient la première : leur écart ne doit
    // pas dépasser celui de deux colonnes (lignes) voisines.
    let seam = 0;
    let neighbours = 0;
    for (let i = 0; i < size; i++) {
      seam = Math.max(seam, Math.abs(at(size - 1, i) - at(0, i)), Math.abs(at(i, size - 1) - at(i, 0)));
      for (let j = 1; j < size; j++) {
        neighbours = Math.max(neighbours, Math.abs(at(j, i) - at(j - 1, i)), Math.abs(at(i, j) - at(i, j - 1)));
      }
    }
    expect(seam).toBeLessThanOrEqual(neighbours * 1.5);
  });

  it('reste entre 0 et 1', () => {
    expect(Math.min(...noise)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...noise)).toBeLessThanOrEqual(1);
  });
});

describe('cloudPixels', () => {
  const pixels = cloudPixels(64);
  const grays = pixels.filter((_, i) => i % 4 === 0);

  it('nuance le gris en continu, entre nuages légers et denses', () => {
    expect(Math.max(...grays)).toBeLessThanOrEqual(Math.round(CLOUD_LIGHT * 255));
    expect(Math.min(...grays)).toBeGreaterThanOrEqual(Math.round(CLOUD_DARK * 255));
    // Un dégradé, pas des taches sur un fond uni : beaucoup de niveaux différents.
    expect(new Set(grays).size).toBeGreaterThan(30);
  });

  it('est opaque partout', () => {
    expect(new Set(pixels.filter((_, i) => i % 4 === 3))).toEqual(new Set([255]));
  });
});
