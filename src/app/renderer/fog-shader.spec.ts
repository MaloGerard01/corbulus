import { EDGE_THRESHOLD_DENSE, EDGE_THRESHOLD_LIGHT, FOG_GLSL, fogEdgeAlpha } from './fog-shader';

describe('fogEdgeAlpha', () => {
  const densities = Array.from({ length: 21 }, (_, i) => i / 20);

  it('garde opaque une couverture pleine, quelle que soit la fumée : la carte reste cachée', () => {
    for (const density of densities) expect(fogEdgeAlpha(1, density)).toBe(1);
  });

  it('ne fait pas apparaître de brouillard là où rien n’est peint', () => {
    for (const density of densities) expect(fogEdgeAlpha(0, density)).toBe(0);
  });

  it('fait avancer les nappes denses et reculer les creux dans le fondu', () => {
    const coverage = 0.5;
    expect(fogEdgeAlpha(coverage, 1)).toBeGreaterThan(0.7);
    expect(fogEdgeAlpha(coverage, 0)).toBeLessThan(0.3);
  });

  it('reste progressif dans le fondu, sans marche', () => {
    for (const density of densities) {
      let previous = 0;
      for (let i = 1; i <= 100; i++) {
        const alpha = fogEdgeAlpha(i / 100, density);
        expect(alpha).toBeGreaterThanOrEqual(previous);
        expect(alpha - previous).toBeLessThan(0.1);
        previous = alpha;
      }
    }
  });
});

describe('FOG_GLSL', () => {
  it('est en ASCII strict (WebGL 1 refuse tout autre caractère)', () => {
    for (const source of [FOG_GLSL.vertex, FOG_GLSL.fragment]) {
      expect([...source].filter((c) => c.charCodeAt(0) > 127)).toEqual([]);
    }
  });

  it('reprend les réglages du bord de fogEdgeAlpha', () => {
    expect(FOG_GLSL.fragment).toContain(`const float EDGE_THRESHOLD_DENSE = ${EDGE_THRESHOLD_DENSE};`);
    expect(FOG_GLSL.fragment).toContain(`const float EDGE_THRESHOLD_LIGHT = ${EDGE_THRESHOLD_LIGHT};`);
    expect(FOG_GLSL.fragment).toContain('out vec4 finalColor;');
  });
});
