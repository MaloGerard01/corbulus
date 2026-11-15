import type { GridConfig } from '../../../core/models/game-state.model';

export interface ImageSize {
  width: number;
  height: number;
}

/** Au-delà, c'est une résolution (« 640x480 »), pas un nombre de cases. */
const MAX_HINT_CELLS = 200;

/**
 * Nombre de cases annoncé dans le nom du fichier, convention courante des
 * cartes de bataille : « taverne_30x20.jpg », « [22x30] Crypte.png ».
 * Les nombres de 4 chiffres ou plus (« 1920x1080 ») sont ignorés.
 */
export function gridSizeFromFileName(name: string): { cols: number; rows: number } | null {
  const match = /(?<!\d)(\d{1,3})\s*[x×]\s*(\d{1,3})(?!\d)/i.exec(name);
  if (!match) return null;

  const cols = Number(match[1]);
  const rows = Number(match[2]);
  const plausible = (n: number) => n >= 1 && n <= MAX_HINT_CELLS;
  return plausible(cols) && plausible(rows) ? { cols, rows } : null;
}

/** Grille qui couvre toute la carte, pour une taille de case et un décalage donnés. */
export function fitGridToMap(
  image: ImageSize,
  mapCellPx: number,
  offsetX = 0,
  offsetY = 0,
): GridConfig {
  return {
    cols: Math.max(1, Math.round(image.width / mapCellPx - offsetX)),
    rows: Math.max(1, Math.round(image.height / mapCellPx - offsetY)),
    mapCellPx,
    offsetX,
    offsetY,
  };
}

/**
 * Grille proposée à l'import d'une carte : d'après le nom du fichier s'il
 * annonce un nombre de cases, sinon en gardant le nombre de colonnes actuel.
 */
export function guessMapGrid(image: ImageSize, fileName: string, fallbackCols: number): GridConfig {
  const hint = gridSizeFromFileName(fileName);
  if (!hint) return fitGridToMap(image, image.width / fallbackCols);

  // L'ordre largeur × hauteur n'est pas toujours respecté :
  // on garde celui qui donne les cases les plus carrées.
  const squareness = (cols: number, rows: number) =>
    Math.abs(Math.log(image.width / cols / (image.height / rows)));
  const cols =
    squareness(hint.cols, hint.rows) <= squareness(hint.rows, hint.cols) ? hint.cols : hint.rows;

  return fitGridToMap(image, image.width / cols);
}
