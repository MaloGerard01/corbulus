import type { AnimatedMapView, BoardView } from '../../../core/models/board-view.model';
import {
  BLANK_MAP,
  findMap,
  type GameState,
  type Player,
  type SessionMap,
} from '../../../core/models/game-state.model';

/**
 * Filtre ce que le plateau a le droit de voir : uniquement la carte affichée
 * (jamais les autres cartes de la session, ni celle en cours d'édition),
 * sans les notes du MJ.
 */
export function toBoardView(state: GameState): BoardView {
  return mapView(findMap(state, state.activeMapId), state.players);
}

/**
 * Vue d'une carte au format du plateau (`null` : grille vierge). Une carte
 * animée n'a ni grille ni brouillard : la grille vierge reste dessous.
 */
export function mapView(map: SessionMap | null, players: Player[]): BoardView {
  if (map && map.kind !== 'image') {
    return {
      mapAssetId: null,
      grid: BLANK_MAP.grid,
      camera: BLANK_MAP.camera,
      fog: BLANK_MAP.fog,
      animated: { kind: map.kind, assetId: map.assetId, playback: map.playback },
      players,
    };
  }
  return {
    mapAssetId: map?.assetId ?? null,
    grid: map?.grid ?? BLANK_MAP.grid,
    camera: map?.camera ?? BLANK_MAP.camera,
    fog: map?.fog ?? BLANK_MAP.fog,
    animated: null,
    players,
  };
}

/**
 * Le store fait des mises à jour immuables avec partage structurel :
 * une branche non modifiée garde la même référence. Comparer les
 * références suffit donc à savoir si le plateau doit être notifié
 * (modifier les notes du MJ ne déclenche aucun envoi).
 */
export function sameBoardView(a: BoardView, b: BoardView): boolean {
  return (
    a.mapAssetId === b.mapAssetId &&
    a.grid === b.grid &&
    a.camera === b.camera &&
    a.fog === b.fog &&
    sameAnimated(a.animated, b.animated) &&
    a.players === b.players
  );
}

/** La vue animée est recréée à chaque calcul : on compare son contenu. */
function sameAnimated(a: AnimatedMapView | null, b: AnimatedMapView | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.assetId === b.assetId && a.playback === b.playback;
}
