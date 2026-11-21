import { glowAlpha, glowPixels, puffPixels } from './explosion-textures';

describe('glowAlpha', () => {
  it('est pleine au centre et nulle au bord', () => {
    expect(glowAlpha(0)).toBe(1);
    expect(glowAlpha(1)).toBe(0);
    expect(glowAlpha(1.5)).toBe(0);
  });

  it('décroît progressivement, sans marche', () => {
    const samples = Array.from({ length: 101 }, (_, i) => glowAlpha(i / 100));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeLessThanOrEqual(samples[i - 1]);
      expect(samples[i - 1] - samples[i]).toBeLessThan(0.05);
    }
  });
});

describe('glowPixels', () => {
  it('donne un halo blanc, opaque au centre et transparent dans les coins', () => {
    const size = 32;
    const pixels = glowPixels(size);
    const at = (x: number, y: number) => pixels.slice((y * size + x) * 4, (y * size + x) * 4 + 4);

    expect([...at(16, 16)]).toEqual([255, 255, 255, expect.any(Number)]);
    expect(at(16, 16)[3]).toBeGreaterThan(240);
    expect(at(0, 0)[3]).toBe(0);
  });
});

describe('puffPixels', () => {
  const size = 64;
  const pixels = puffPixels(size, 7);
  const alpha = (x: number, y: number) => pixels[(y * size + x) * 4 + 3];

  it('est transparente au bord et dans les coins', () => {
    expect(alpha(0, 0)).toBe(0);
    expect(alpha(size - 1, size - 1)).toBe(0);
    expect(alpha(0, size / 2)).toBeLessThan(5);
  });

  it('est dense au centre, avec des volutes (pas un rond uni)', () => {
    const center: number[] = [];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
        if (r < 0.3) center.push(alpha(x, y));
      }
    }
    expect(Math.min(...center)).toBeGreaterThan(80);
    expect(Math.max(...center) - Math.min(...center)).toBeGreaterThan(20);
  });

  it("change d'une graine à l'autre", () => {
    expect(puffPixels(size, 20)).not.toEqual(pixels);
  });
});
