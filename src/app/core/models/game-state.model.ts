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

/**
 * Aspect du brouillard peint : `darkness` cache tout en noir, `fog` (brouillard
 * de guerre) sous un gris nuageux.
 */
export type FogStyle = 'darkness' | 'fog';

export const FOG_STYLE_LABELS: Record<FogStyle, string> = {
  darkness: 'Obscurité',
  fog: 'Brouillard de guerre',
};

interface FogOpBase {
  /** Identifie l'opération : le plateau sait ainsi ce qu'il a déjà dessiné. */
  id: string;
  /** `hide` cache la carte, `reveal` la dévoile. */
  mode: 'hide' | 'reveal';
  /** Aspect du brouillard ajouté par `hide` (sans effet pour `reveal`). */
  style: FogStyle;
}

/** Largeur du fondu par défaut, en cases : une à deux cases assombries avant le noir complet. */
export const DEFAULT_FOG_FADE = 2;

/** Coup de pinceau, à bords progressifs. */
export interface FogBrushOp extends FogOpBase {
  kind: 'brush';
  /** Diamètre du cœur du pinceau, entièrement couvert, en cases. */
  size: number;
  /** Largeur du fondu autour du cœur, en cases (0 : bord net). */
  fade: number;
  /** Centres successifs du pinceau, en cases. Un tracé en cours ne fait que s'allonger. */
  points: [number, number][];
}

/** Toute la carte d'un coup (« Tout couvrir » / « Tout dévoiler »), annulable. */
export interface FogFillOp extends FogOpBase {
  kind: 'fill';
}

export type FogOp = FogBrushOp | FogFillOp;

export interface FogState {
  /** Afficher ou masquer le brouillard peint, sans le perdre. */
  enabled: boolean;
  /** Appliquées dans l'ordre sur une carte d'abord entièrement visible. */
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

/**
 * Zone affichée sur la TV. Le renderer la ramène dans la grille : inutile
 * (et impossible côté MJ) de connaître l'écran pour la borner.
 */
export interface Camera {
  /** Centre de la zone, en cases. */
  x: number;
  y: number;
  /**
   * 1 : la carte couvre juste l'écran. 2 : cases deux fois plus grandes,
   * deux fois moins de cases visibles (mode « Précis » de l'aperçu MJ).
   */
  zoom: number;
}

/** Caméra centrée sur la grille, sans zoom. */
export function centeredCamera(grid: Pick<GridConfig, 'cols' | 'rows'>): Camera {
  return { x: grid.cols / 2, y: grid.rows / 2, zoom: 1 };
}

/**
 * Carte chargée dans la session, avec tout ce qui lui est propre : changer
 * de carte puis y revenir retrouve sa grille, sa vue et son brouillard.
 */
export interface SessionMap {
  id: string;
  /** Image dans IndexedDB (voir AssetRepository). */
  assetId: string;
  name: string;
  grid: GridConfig;
  camera: Camera;
  fog: FogState;
}

export const DEFAULT_GRID: Readonly<GridConfig> = {
  cols: 24,
  rows: 14,
  mapCellPx: 100,
  offsetX: 0,
  offsetY: 0,
};

/**
 * Ce que montre la TV quand aucune carte n'est affichée : une grille vierge.
 * Constante (références stables) : le plateau n'est pas notifié pour rien.
 */
export const BLANK_MAP: Readonly<Pick<SessionMap, 'grid' | 'camera' | 'fog'>> = {
  grid: DEFAULT_GRID,
  camera: centeredCamera(DEFAULT_GRID),
  fog: { enabled: false, ops: [] },
};

/** Source de vérité de la partie. N'existe que côté MJ. */
export interface GameState {
  revision: number;
  /** Cartes de la session, dans l'ordre d'import. */
  maps: SessionMap[];
  /** Carte affichée sur la TV ; `null` : grille vierge. */
  activeMapId: string | null;
  /**
   * Carte en cours d'édition dans la vue MJ (aperçu, propriétés), affichée
   * ou non sur la TV. Jamais envoyé au plateau.
   */
  selectedMapId: string | null;
  /**
   * Mode « Précis » de l'aperçu MJ : la zone affichée sur la TV peut être
   * redimensionnée (zoom). Jamais envoyé au plateau.
   */
  preciseView: boolean;
  players: Player[];
  /** Jamais envoyé au plateau. */
  dmNotes: string;
}

export function createInitialGameState(): GameState {
  return {
    revision: 0,
    maps: [],
    activeMapId: null,
    selectedMapId: null,
    preciseView: false,
    players: [],
    dmNotes: '',
  };
}

export function findMap(state: GameState, id: string | null): SessionMap | null {
  return state.maps.find((m) => m.id === id) ?? null;
}

/** Nom affiché d'une carte : le nom du fichier, sans extension. */
export function mapNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}
