import { hpLevel, hpPercent } from './hp';

describe('hpLevel', () => {
  const level = (hp: number, hpMax = 10) => hpLevel({ hp, hpMax });

  it('classe la santé par tranche : plus de la moitié, plus du quart, en dessous', () => {
    expect(level(6)).toBe('high');
    expect(level(5)).toBe('mid');
    expect(level(3)).toBe('mid');
    expect(level(2)).toBe('low');
    expect(level(1)).toBe('low');
  });

  it('distingue le joueur hors combat (0 PV)', () => {
    expect(level(0)).toBe('down');
  });
});

describe('hpPercent', () => {
  it('reste entre 0 et 100', () => {
    expect(hpPercent({ hp: 7, hpMax: 10 })).toBeCloseTo(70);
    expect(hpPercent({ hp: 12, hpMax: 10 })).toBe(100);
    expect(hpPercent({ hp: 3, hpMax: 0 })).toBe(0);
  });
});
