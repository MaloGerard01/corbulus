import type { BoardView } from '../../../core/models/board-view.model';
import type { GameState } from '../../../core/models/game-state.model';

/** Filtre ce que le plateau a le droit de voir. */
export function toBoardView(state: GameState): BoardView {
  return {
    mapAssetId: state.mapAssetId,
    grid: state.grid,
    fog: state.fog,
    players: state.players,
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
    a.fog === b.fog &&
    a.players === b.players
  );
}
