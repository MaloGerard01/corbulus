import type { VideoPlayback } from './video-playback';

/** Côté de la table où est assis un joueur. Sert à orienter son HUD. */
export type Seat = 'bottom' | 'top' | 'left' | 'right';

export const SEATS: readonly Seat[] = ['bottom', 'top', 'left', 'right'];

export const SEAT_LABELS: Record<Seat, string> = {
  bottom: 'Bas',
  top: 'Haut',
  left: 'Gauche',
  right: 'Droite',
};

/** Style des cartes des joueurs sur la TV, pour s'accorder au jeu. */
export type HudTheme = 'classic' | 'fantasy' | 'scifi';

export const HUD_THEMES: readonly HudTheme[] = ['classic', 'fantasy', 'scifi'];

export const HUD_THEME_LABELS: Record<HudTheme, string> = {
  classic: 'Sobre',
  fantasy: 'Médiéval-fantastique',
  scifi: 'Science-fiction',
};

export interface Player {
  id: string;
  name: string;
  color: string;
  /** Côté de l'écran où s'affiche son HUD, tourné vers le centre de la table. */
  seat: Seat;
  /**
   * Position personnalisée du HUD le long de son côté, de 0 (début) à 1
   * (fin) dans le sens de l'écran : de gauche à droite en haut et en bas, de
   * haut en bas à gauche et à droite. Le HUD reste entier à l'écran, à 0 il
   * touche le coin de départ, à 1 celui d'arrivée. `null` : centré avec les
   * autres joueurs du même côté.
   */
  seatPosition: number | null;
  /** Portrait du personnage (image dans IndexedDB) ; `null` : aucun. */
  portraitAssetId: string | null;
  hp: number;
  hpMax: number;
  gold: number;
}

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
 * Nature d'une carte :
 * - `image` : carte fixe, avec grille, cadrage et brouillard ;
 * - `gif` : animée, lue en boucle, plein écran ;
 * - `video` : animée, plein écran, lecture commandée par le MJ.
 */
export type MapKind = 'image' | 'gif' | 'video';

export const MAP_KIND_LABELS: Record<MapKind, string> = {
  image: 'Image',
  gif: 'GIF',
  video: 'Vidéo',
};

/**
 * Carte chargée dans la session, avec tout ce qui lui est propre : changer
 * de carte puis y revenir retrouve sa grille, sa vue et son brouillard.
 */
export interface SessionMap {
  id: string;
  /** Fichier dans IndexedDB (voir AssetRepository). */
  assetId: string;
  name: string;
  kind: MapKind;
  /** Lecture de la vidéo (`null` pour une image ou un GIF). */
  playback: VideoPlayback | null;
  /** Grille, cadrage et brouillard : cartes fixes seulement (ignorés si animée). */
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
  /** Style des cartes de tous les joueurs. */
  hudTheme: HudTheme;
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
    hudTheme: 'classic',
    dmNotes: '',
  };
}

/**
 * Fichiers importés qu'utilise une session (cartes et portraits) : le
 * nettoyage d'IndexedDB ne doit supprimer aucun d'eux.
 */
export function sessionAssetIds(state: Pick<GameState, 'maps' | 'players'>): string[] {
  return [
    ...state.maps.map((m) => m.assetId),
    ...state.players.flatMap((p) => (p.portraitAssetId ? [p.portraitAssetId] : [])),
  ];
}

export function findMap(state: GameState, id: string | null): SessionMap | null {
  return state.maps.find((m) => m.id === id) ?? null;
}

/** Nom affiché d'une carte : le nom du fichier, sans extension. */
export function mapNameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}
