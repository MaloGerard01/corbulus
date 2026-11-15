import { centeredCamera, type Camera, type GridConfig } from '../core/models/game-state.model';

/**
 * `contain` : toute la grille est visible (bandes vides si les proportions
 * diffèrent) ; la caméra est ignorée.
 * `cover` : la grille couvre tout l'écran, ce qui dépasse est rogné ; la
 * caméra choisit la zone visible et son zoom.
 */
export type Fit = 'contain' | 'cover';

type GridSize = Pick<GridConfig, 'cols' | 'rows'>;

/** Point en cases. */
export interface CellPoint {
  x: number;
  y: number;
}

/** Rectangle en cases. */
export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Placement de la grille dans le canvas. */
export interface Layout {
  /** Taille d'une case, en pixels CSS. */
  cellPx: number;
  /** Coin haut-gauche de la grille dans le canvas, en pixels CSS. */
  originX: number;
  originY: number;
  /** Caméra réellement appliquée, une fois ramenée dans la grille. */
  camera: Camera;
}

/**
 * Seul endroit où l'on passe des cases aux pixels écran.
 * La taille des cases dépend du mode d'ajustement ; le calibrage
 * (1 case = 1 pouce sur la TV) viendra la fixer ici.
 */
export function computeLayout(
  width: number,
  height: number,
  grid: GridSize,
  camera: Camera,
  fit: Fit,
): Layout {
  const wanted = fit === 'cover' ? camera : centeredCamera(grid);
  const zoom = wanted.zoom > 0 ? wanted.zoom : 1;
  const scale = fit === 'cover' ? Math.max : Math.min;
  const cellPx = Math.max(0, scale(width / grid.cols, height / grid.rows) * zoom);
  if (cellPx === 0) return { cellPx, originX: 0, originY: 0, camera: centeredCamera(grid) };

  const x = clampAxis(wanted.x, width / cellPx, grid.cols);
  const y = clampAxis(wanted.y, height / cellPx, grid.rows);
  return {
    cellPx,
    originX: width / 2 - x * cellPx,
    originY: height / 2 - y * cellPx,
    camera: { x, y, zoom },
  };
}

/** Partie de la grille visible à l'écran, en cases. */
export function visibleCells(
  width: number,
  height: number,
  grid: GridSize,
  camera: Camera,
  fit: Fit,
): CellRect {
  const { cellPx, originX, originY } = computeLayout(width, height, grid, camera, fit);
  if (cellPx === 0) return { x: 0, y: 0, w: 0, h: 0 };

  const x = Math.max(0, -originX / cellPx);
  const y = Math.max(0, -originY / cellPx);
  const right = Math.min(grid.cols, (width - originX) / cellPx);
  const bottom = Math.min(grid.rows, (height - originY) / cellPx);
  return { x, y, w: right - x, h: bottom - y };
}

/**
 * Sur un axe où la grille dépasse de l'écran, le centre est borné pour que
 * l'écran reste dans la grille ; si elle tient en entier, elle est centrée.
 */
function clampAxis(center: number, visible: number, total: number): number {
  if (visible >= total) return total / 2;
  return Math.min(total - visible / 2, Math.max(visible / 2, center));
}
