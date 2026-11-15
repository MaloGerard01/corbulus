import type { FogOp } from '../core/models/game-state.model';

/**
 * Identifiant par valeur d'une opération de brouillard.
 * Côté plateau, l'état arrive cloné par BroadcastChannel : les références
 * changent à chaque message, seule une comparaison par valeur est fiable.
 */
export function fogOpKey(op: FogOp): string {
  return JSON.stringify(op);
}

/**
 * Indice de la première opération de `next` qui n'est pas encore dessinée
 * sur un calque à jour pour `drawn` (`next.length` s'il n'y a rien à faire),
 * ou `null` s'il faut tout redessiner (opération retirée ou modifiée : annulation…).
 */
export function firstNewFogOp(drawn: readonly string[], next: readonly string[]): number | null {
  if (next.length < drawn.length) return null;
  for (let i = 0; i < drawn.length; i++) {
    if (drawn[i] !== next[i]) return null;
  }
  return drawn.length;
}
