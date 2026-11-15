import type { GridConfig } from '../core/models/game-state.model';

/** Placement de la grille dans le canvas. */
export interface Layout {
  /** Taille d'une case, en pixels CSS. */
  cellPx: number;
  /** Coin haut-gauche de la grille dans le canvas, en pixels CSS. */
  originX: number;
  originY: number;
}

/**
 * Seul endroit où l'on passe des cases aux pixels écran.
 * Pour l'instant la grille est ajustée au canvas et centrée ; le calibrage
 * (1 case = 1 pouce sur la TV) viendra fixer `cellPx` ici.
 */
export function computeLayout(
  width: number,
  height: number,
  grid: Pick<GridConfig, 'cols' | 'rows'>,
): Layout {
  const cellPx = Math.max(0, Math.min(width / grid.cols, height / grid.rows));
  return {
    cellPx,
    originX: (width - grid.cols * cellPx) / 2,
    originY: (height - grid.rows * cellPx) / 2,
  };
}
