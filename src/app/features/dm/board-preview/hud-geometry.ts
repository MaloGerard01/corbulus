import type { HudTheme, Player, Seat } from '../../../core/models/game-state.model';

/**
 * Géométrie du placement d'un HUD sur un bord de la TV, dans l'aperçu du MJ.
 * Tout est en pixels de l'aperçu, sauf les tailles du HUD, en pixels de la TV.
 */

/** Écran de la TV dans l'aperçu, en pixels. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Pixels de l'aperçu par pixel de la TV. */
  scale: number;
}

/** Rectangle dans l'aperçu, en pixels. */
export interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Côté de l'écran et position le long de ce côté (voir `Player.seatPosition`). */
export interface HudSpot {
  seat: Seat;
  position: number;
}

/**
 * Taille approximative d'un HUD sur la TV, par style, en pixels CSS (le
 * plateau est une autre fenêtre : on ne peut pas le mesurer). La longueur
 * court le long du bord, quel que soit le côté (le HUD est tourné vers le
 * centre).
 */
interface HudDimensions {
  /** Carte des infos (et son espacement) : longueur et profondeur. */
  card: number;
  depth: number;
  /** Nom à l'envers, seul, à gauche des infos. */
  name: number;
  /** Portrait au-dessus de ce nom : longueur et profondeur de l'ensemble. */
  portrait: number;
  portraitDepth: number;
}

const HUD_DIMENSIONS: Record<HudTheme, HudDimensions> = {
  classic: { card: 240, depth: 96, name: 96, portrait: 112, portraitDepth: 112 },
  fantasy: { card: 334, depth: 124, name: 104, portrait: 108, portraitDepth: 126 },
  scifi: { card: 344, depth: 124, name: 112, portrait: 112, portraitDepth: 124 },
};

/** Écart entre le HUD et le bord de l'écran (`p-3` des bandeaux du plateau). */
export const HUD_MARGIN = 12;

/** Taille d'un HUD sur la TV, dans un style : longueur (le long du bord) et profondeur. */
export function hudSize(
  player: Pick<Player, 'portraitAssetId'>,
  theme: HudTheme,
): { length: number; depth: number } {
  const size = HUD_DIMENSIONS[theme];
  return player.portraitAssetId
    ? { length: size.card + size.portrait, depth: Math.max(size.depth, size.portraitDepth) }
    : { length: size.card + size.name, depth: size.depth };
}

/**
 * Bord le plus proche du point, et position le long de ce bord pour que le
 * HUD y soit centré sur le point, sans dépasser des coins.
 */
export function snapToEdge(
  point: { x: number; y: number },
  screen: ScreenRect,
  hudLength: number,
): HudSpot {
  const x = point.x - screen.left;
  const y = point.y - screen.top;
  const distances: [Seat, number][] = [
    ['top', y],
    ['bottom', screen.height - y],
    ['left', x],
    ['right', screen.width - x],
  ];
  const [seat] = distances.reduce((best, current) => (current[1] < best[1] ? current : best));

  const horizontal = seat === 'top' || seat === 'bottom';
  const edge = horizontal ? screen.width : screen.height;
  const along = horizontal ? x : y;
  const margin = HUD_MARGIN * screen.scale;
  const length = hudLength * screen.scale;
  const free = edge - 2 * margin - length;
  const position = free > 0 ? clamp01((along - margin - length / 2) / free) : 0.5;
  return { seat, position };
}

/** Rectangle occupé par un HUD placé en `spot`, dans l'aperçu. */
export function hudRect(
  spot: HudSpot,
  screen: ScreenRect,
  size: { length: number; depth: number },
): PxRect {
  const margin = HUD_MARGIN * screen.scale;
  const length = size.length * screen.scale;
  const depth = size.depth * screen.scale;
  const horizontal = spot.seat === 'top' || spot.seat === 'bottom';
  const edge = horizontal ? screen.width : screen.height;
  const start = margin + spot.position * Math.max(0, edge - 2 * margin - length);

  switch (spot.seat) {
    case 'bottom':
      return { left: screen.left + start, top: screen.top + screen.height - margin - depth, width: length, height: depth };
    case 'top':
      return { left: screen.left + start, top: screen.top + margin, width: length, height: depth };
    case 'left':
      return { left: screen.left + margin, top: screen.top + start, width: depth, height: length };
    case 'right':
      return { left: screen.left + screen.width - margin - depth, top: screen.top + start, width: depth, height: length };
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
