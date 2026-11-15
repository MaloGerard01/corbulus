import type { BoardView } from './board-view.model';
import type { Shape } from './game-state.model';

/** Effets ponctuels : joués une fois, jamais persistés ni rejoués au rechargement. */
export type BoardEvent =
  | { kind: 'ping'; x: number; y: number; color: string }
  | { kind: 'focus'; shape: Shape; durationMs: number }
  | { kind: 'shake' };

/** Taille de la fenêtre du plateau (la TV), en pixels CSS. */
export interface BoardViewport {
  width: number;
  height: number;
}

export type SyncMessage =
  /** Envoyé par le plateau à son démarrage pour demander l'état complet. */
  | { type: 'hello' }
  /** État persistant, envoyé par le MJ à chaque changement visible. */
  | { type: 'state'; payload: BoardView }
  | { type: 'event'; payload: BoardEvent }
  /**
   * Envoyé par le plateau à son démarrage, à chaque redimensionnement et en
   * réponse à `viewport-request` : le MJ en a besoin pour encadrer, dans son
   * aperçu, la zone visible sur la TV.
   */
  | { type: 'viewport'; payload: BoardViewport }
  /** Envoyé par le MJ à son démarrage, si le plateau est déjà ouvert. */
  | { type: 'viewport-request' };

export type SyncMessageType = SyncMessage['type'];

export type SyncMessageOf<T extends SyncMessageType> = Extract<SyncMessage, { type: T }>;
