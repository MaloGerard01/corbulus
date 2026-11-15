import type { Camera } from '../../../core/models/game-state.model';
import { resizeFrame } from './frame-resize';

/** TV 16:9 et grille 20 × 20 : sans zoom, le cadre fait 20 × 11,25 cases. */
const viewport = { width: 1600, height: 900 };
const grid = { cols: 20, rows: 20 };

function expectCamera(actual: Camera, expected: Camera): void {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
  expect(actual.zoom).toBeCloseTo(expected.zoom);
}

describe('resizeFrame', () => {
  it('coin bas droit : le coin haut gauche reste fixe et les proportions sont gardées', () => {
    // Cadre de 10 × 5,625 cases depuis (2, 3) : deux fois moins large que sans zoom.
    const camera = resizeFrame('bottom-right', { x: 2, y: 3 }, { x: 12, y: 8.625 }, viewport, grid);
    expectCamera(camera, { x: 7, y: 5.8125, zoom: 2 });
  });

  it('coin haut gauche : le coin bas droit reste fixe', () => {
    const camera = resizeFrame('top-left', { x: 12, y: 8.625 }, { x: 2, y: 3 }, viewport, grid);
    expectCamera(camera, { x: 7, y: 5.8125, zoom: 2 });
  });

  it('suit aussi un geste purement horizontal', () => {
    const wide = resizeFrame('bottom-right', { x: 0, y: 0 }, { x: 20, y: 11.25 }, viewport, grid);
    const narrower = resizeFrame('bottom-right', { x: 0, y: 0 }, { x: 10, y: 11.25 }, viewport, grid);
    expect(narrower.zoom).toBeGreaterThan(wide.zoom);
  });

  it('ne dépasse pas la taille sans zoom', () => {
    const camera = resizeFrame('bottom-right', { x: 0, y: 0 }, { x: 50, y: 50 }, viewport, grid);
    expect(camera.zoom).toBe(1);
  });

  it('garde au moins 2 cases sur le petit côté', () => {
    const camera = resizeFrame('bottom-right', { x: 5, y: 5 }, { x: 4, y: 4 }, viewport, grid);
    // 2 cases de haut = 3,55 cases de large, contre 20 sans zoom.
    expect(camera.zoom).toBeCloseTo(20 / (2 * (16 / 9)));
  });
});
