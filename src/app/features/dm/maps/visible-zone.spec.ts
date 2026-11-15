import type { CellRect } from '../../../renderer/layout';
import { visibleImageZone } from './visible-zone';

/** TV 16:9, image 3000 × 2000 px. */
const TV = { width: 1600, height: 900 };
const image = { width: 3000, height: 2000 };
const grid = { cols: 30, rows: 20, mapCellPx: 100, offsetX: 0, offsetY: 0 };

function expectZone(actual: CellRect, expected: CellRect): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.w).toBeCloseTo(expected.w);
  expect(actual.h).toBeCloseTo(expected.h);
}

describe('visibleImageZone', () => {
  it('sans zoom : toute la largeur, rognée en haut et en bas', () => {
    // Cases de 53,3 px : 30 × 16,875 cases visibles, centrées.
    const zone = visibleImageZone(TV, { grid, camera: { x: 15, y: 10, zoom: 1 } }, image);
    expectZone(zone, { x: 0, y: 156.25, w: 3000, h: 1687.5 });
  });

  it('suit la position et le zoom de la carte, sans sortir de la grille', () => {
    // Zoom 2 : 15 × 8,4375 cases ; x = 5 est ramené à 7,5 pour ne pas sortir à gauche.
    const zone = visibleImageZone(TV, { grid, camera: { x: 5, y: 5, zoom: 2 } }, image);
    expectZone(zone, { x: 0, y: 78.125, w: 1500, h: 843.75 });
  });

  it('tient compte du décalage de la grille dans l’image', () => {
    const shifted = { ...grid, offsetX: 0.5 };
    const zone = visibleImageZone(TV, { grid: shifted, camera: { x: 15, y: 10, zoom: 1 } }, image);
    // La grille commence à 50 px dans l'image ; sa fin (3050 px) est ramenée au bord.
    expectZone(zone, { x: 50, y: 156.25, w: 2950, h: 1687.5 });
  });

  it("reste dans l'image quand la grille la dépasse", () => {
    const wide = { ...grid, cols: 40 };
    const zone = visibleImageZone(TV, { grid: wide, camera: { x: 20, y: 10, zoom: 1 } }, image);
    expect(zone.x + zone.w).toBeCloseTo(3000);
    expect(zone.h).toBeCloseTo(2000);
  });
});
