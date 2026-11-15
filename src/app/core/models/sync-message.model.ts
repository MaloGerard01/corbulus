import type { BoardView } from './board-view.model';
import type { Shape } from './game-state.model';

/** Effets ponctuels : joués une fois, jamais persistés ni rejoués au rechargement. */
export type BoardEvent =
  | { kind: 'ping'; x: number; y: number; color: string }
  | { kind: 'focus'; shape: Shape; durationMs: number }
  | { kind: 'shake' };

export type SyncMessage =
  /** Envoyé par le plateau à son démarrage pour demander l'état complet. */
  | { type: 'hello' }
  /** État persistant, envoyé par le MJ à chaque changement visible. */
  | { type: 'state'; payload: BoardView }
  | { type: 'event'; payload: BoardEvent };

export type SyncMessageType = SyncMessage['type'];

export type SyncMessageOf<T extends SyncMessageType> = Extract<SyncMessage, { type: T }>;
