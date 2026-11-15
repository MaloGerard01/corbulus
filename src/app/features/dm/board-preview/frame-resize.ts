import { centeredCamera, type Camera, type GridConfig } from '../../../core/models/game-state.model';
import type { BoardViewport } from '../../../core/models/sync-message.model';
import { computeLayout, type CellPoint } from '../../../renderer/layout';

export type FrameCorner = 'top-left' | 'bottom-right';

/** Le cadre ne descend pas sous ce nombre de cases sur son petit côté. */
const MIN_VISIBLE_CELLS = 2;

/**
 * Caméra correspondant au cadre de la TV redimensionné par l'un de ses coins.
 * Le coin opposé (`anchor`) reste fixe et le cadre garde les proportions de
 * la TV : ce qu'il encadre est exactement ce qu'elle affichera.
 *
 * Le cadre ne peut pas dépasser la taille qu'il a sans zoom (la carte
 * couvre juste l'écran). Le résultat n'est pas encore ramené dans la grille.
 */
export function resizeFrame(
  corner: FrameCorner,
  anchor: CellPoint,
  pointer: CellPoint,
  viewport: BoardViewport,
  grid: Pick<GridConfig, 'cols' | 'rows'>,
): Camera {
  const aspect = viewport.width / viewport.height;
  const baseCellPx = computeLayout(viewport.width, viewport.height, grid, centeredCamera(grid), 'cover')
    .cellPx;
  const fullWidth = viewport.width / baseCellPx;

  // Le coin glisse le long de la diagonale du cadre, à la projection du
  // pointeur : il le suit en douceur, quelle que soit la direction du geste.
  const direction = corner === 'bottom-right' ? 1 : -1;
  const dx = (pointer.x - anchor.x) * direction;
  const dy = (pointer.y - anchor.y) * direction;
  const projected = (aspect * (dx * aspect + dy)) / (aspect * aspect + 1);

  const minWidth = MIN_VISIBLE_CELLS * Math.max(aspect, 1);
  const width = Math.min(fullWidth, Math.max(minWidth, projected));
  const height = width / aspect;

  return {
    x: anchor.x + (direction * width) / 2,
    y: anchor.y + (direction * height) / 2,
    zoom: fullWidth / width,
  };
}
