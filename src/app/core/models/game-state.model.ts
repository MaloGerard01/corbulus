/** Côté de la table où est assis un joueur. Sert à orienter son HUD. */
export type Seat = 'bottom' | 'top' | 'left' | 'right';

export const SEATS: readonly Seat[] = ['bottom', 'top', 'left', 'right'];

export const SEAT_LABELS: Record<Seat, string> = {
  bottom: 'Bas',
  top: 'Haut',
  left: 'Gauche',
  right: 'Droite',
};

export interface Player {
  id: string;
  name: string;
  color: string;
  seat: Seat;
  hp: number;
  hpMax: number;
  gold: number;
}

/** Toutes les coordonnées sont en unités de grille (cases), jamais en pixels écran. */
export type Shape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'polygon'; points: [number, number][] };

export interface FogOp {
  mode: 'reveal' | 'hide';
  shape: Shape;
}

export interface FogState {
  enabled: boolean;
  /** Appliquées dans l'ordre sur un calque entièrement noir. */
  ops: FogOp[];
}

export interface GridConfig {
  cols: number;
  rows: number;
  /**
   * Taille d'une case dans l'image de la carte, en pixels de l'image
   * (pas de l'écran) : c'est l'échelle de la carte.
   */
  mapCellPx: number;
  /** Décalage de la grille par rapport à l'image de la carte, en cases. */
  offsetX: number;
  offsetY: number;
}

/** Source de vérité de la partie. N'existe que côté MJ. */
export interface GameState {
  revision: number;
  mapAssetId: string | null;
  grid: GridConfig;
  fog: FogState;
  players: Player[];
  /** Jamais envoyé au plateau. */
  dmNotes: string;
}

export function createInitialGameState(): GameState {
  return {
    revision: 0,
    mapAssetId: null,
    grid: { cols: 24, rows: 14, mapCellPx: 100, offsetX: 0, offsetY: 0 },
    fog: { enabled: false, ops: [] },
    players: [],
    dmNotes: '',
  };
}
