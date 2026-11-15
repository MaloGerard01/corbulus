import type { Camera, FogState, GridConfig, Player } from './game-state.model';

/**
 * Projection de l'état envoyée au plateau.
 * Tout ce qui n'est pas ici reste côté MJ (notes, éléments cachés…).
 */
export interface BoardView {
  mapAssetId: string | null;
  grid: GridConfig;
  camera: Camera;
  fog: FogState;
  players: Player[];
}
