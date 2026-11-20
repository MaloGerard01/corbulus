import type { Camera, FogState, GridConfig, Player } from './game-state.model';
import type { VideoPlayback } from './video-playback';

/**
 * Carte animée affichée sur la TV, à la place de la carte fixe : plein
 * écran, sans grille ni brouillard.
 */
export interface AnimatedMapView {
  kind: 'gif' | 'video';
  assetId: string;
  /** Vidéo seulement : lecture commandée par le MJ. */
  playback: VideoPlayback | null;
}

/**
 * Projection de l'état envoyée au plateau.
 * Tout ce qui n'est pas ici reste côté MJ (notes, éléments cachés…).
 */
export interface BoardView {
  /** Image de la carte fixe (`null` : grille vierge, ou carte animée). */
  mapAssetId: string | null;
  grid: GridConfig;
  camera: Camera;
  fog: FogState;
  /** Carte animée affichée par-dessus (`null` : carte fixe ou grille vierge). */
  animated: AnimatedMapView | null;
  players: Player[];
}
