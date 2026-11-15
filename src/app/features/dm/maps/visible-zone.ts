import type { SessionMap } from '../../../core/models/game-state.model';
import type { BoardViewport } from '../../../core/models/sync-message.model';
import { visibleCells, type CellRect } from '../../../renderer/layout';
import { RENDER_STYLES } from '../../../renderer/render-style';

/**
 * Zone de l'image d'une carte que la TV montrera quand cette carte sera
 * affichée, en pixels de l'image. Même calcul que le renderer du plateau,
 * avec la grille et la vue propres à la carte.
 *
 * La TV ne montre jamais rien hors de la grille, ni de l'image : la zone est
 * ramenée dans l'image.
 */
export function visibleImageZone(
  viewport: BoardViewport,
  map: Pick<SessionMap, 'grid' | 'camera'>,
  image: { width: number; height: number },
): CellRect {
  const cells = visibleCells(
    viewport.width,
    viewport.height,
    map.grid,
    map.camera,
    RENDER_STYLES.board.fit,
  );
  const { mapCellPx, offsetX, offsetY } = map.grid;
  // La case (0, 0) de la grille tombe à (offsetX, offsetY) cases dans l'image.
  const toImageX = (x: number) => clamp((x + offsetX) * mapCellPx, 0, image.width);
  const toImageY = (y: number) => clamp((y + offsetY) * mapCellPx, 0, image.height);

  const left = toImageX(cells.x);
  const top = toImageY(cells.y);
  return {
    x: left,
    y: top,
    w: toImageX(cells.x + cells.w) - left,
    h: toImageY(cells.y + cells.h) - top,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
