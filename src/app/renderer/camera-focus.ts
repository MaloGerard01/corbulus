import type { Camera } from '../core/models/game-state.model';

/** Durée de chaque déplacement de la caméra (l'aller, puis le retour), en ms. */
export const FOCUS_MOVE_MS = 800;

/** Focus en cours sur la TV. */
export interface CameraFocus {
  /** Caméra affichée au lancement (un focus peut en interrompre un autre). */
  from: Camera;
  /** Caméra visée. */
  to: Camera;
  /** Temps passé sur la cible, entre l'aller et le retour, en ms. */
  holdMs: number;
  /** Instant du lancement, sur la même horloge que `now`. */
  start: number;
}

/**
 * Caméra à afficher à l'instant `now` : aller vers la cible, pause, puis
 * retour vers `base` (la caméra choisie par le MJ, qui a pu bouger entre-temps).
 * `null` une fois le retour terminé.
 *
 * `bound` ramène une caméra dans la grille : on interpole entre caméras
 * bornées, sinon le mouvement « attendrait » contre les bords.
 */
export function focusCamera(
  focus: CameraFocus,
  now: number,
  base: Camera,
  bound: (camera: Camera) => Camera,
): Camera | null {
  const elapsed = Math.max(0, now - focus.start);
  const target = bound(focus.to);
  if (elapsed < FOCUS_MOVE_MS) {
    return lerpCamera(bound(focus.from), target, easeInOut(elapsed / FOCUS_MOVE_MS));
  }

  const back = elapsed - FOCUS_MOVE_MS - focus.holdMs;
  if (back < 0) return target;
  if (back < FOCUS_MOVE_MS) return lerpCamera(target, bound(base), easeInOut(back / FOCUS_MOVE_MS));
  return null;
}

/** Position linéaire ; zoom géométrique, pour un grossissement régulier. */
export function lerpCamera(a: Camera, b: Camera, t: number): Camera {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    zoom: a.zoom * (b.zoom / a.zoom) ** t,
  };
}

/** Démarrage et arrivée en douceur. */
function easeInOut(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
