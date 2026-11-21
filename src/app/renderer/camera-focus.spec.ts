import type { Camera } from '../core/models/game-state.model';
import { FOCUS_MOVE_MS, focusCamera, lerpCamera, type CameraFocus } from './camera-focus';

describe('focusCamera', () => {
  const home: Camera = { x: 10, y: 10, zoom: 1 };
  const focus: CameraFocus = { from: home, to: { x: 4, y: 6, zoom: 2 }, holdMs: 5000, start: 1000 };
  const unbounded = (camera: Camera) => camera;

  it("part de la caméra affichée et arrive sur la cible à la fin de l'aller", () => {
    expect(focusCamera(focus, 1000, home, unbounded)).toEqual(home);
    expect(focusCamera(focus, 1000 + FOCUS_MOVE_MS, home, unbounded)).toEqual(focus.to);
  });

  it('reste sur la cible pendant la durée choisie', () => {
    expect(focusCamera(focus, 1000 + FOCUS_MOVE_MS + 4999, home, unbounded)).toEqual(focus.to);
  });

  it('revient à la caméra du MJ, même si elle a bougé entre-temps, puis se termine', () => {
    const moved: Camera = { x: 12, y: 8, zoom: 1 };
    const end = 1000 + 2 * FOCUS_MOVE_MS + 5000;

    const halfway = focusCamera(focus, end - FOCUS_MOVE_MS / 2, moved, unbounded)!;
    expect(halfway.x).toBeCloseTo(8);
    expect(halfway.y).toBeCloseTo(7);
    expect(focusCamera(focus, end - 1, moved, unbounded)!.x).toBeCloseTo(12, 1);
    expect(focusCamera(focus, end, moved, unbounded)).toBeNull();
  });

  it('interpole entre les caméras bornées à la grille', () => {
    // La cible est hors de la grille : la caméra bornée s'arrête à x = 5.
    const bound = (camera: Camera) => ({ ...camera, x: Math.max(5, camera.x) });
    expect(focusCamera(focus, 1000 + FOCUS_MOVE_MS, home, bound)).toEqual({ x: 5, y: 6, zoom: 2 });
  });
});

describe('lerpCamera', () => {
  it('grossit de façon régulière : à mi-chemin entre ×1 et ×4, le zoom vaut ×2', () => {
    const camera = lerpCamera({ x: 0, y: 0, zoom: 1 }, { x: 10, y: 20, zoom: 4 }, 0.5);
    expect(camera).toEqual({ x: 5, y: 10, zoom: 2 });
  });
});
