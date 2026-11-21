import type { BoardView } from './board-view.model';
import type { Camera } from './game-state.model';

/** Effets ponctuels : joués une fois, jamais persistés ni rejoués au rechargement. */
export type BoardEvent =
  /** Rond qui s'agrandit puis disparaît, centré sur (`x`, `y`) en cases. */
  | { kind: 'ping'; x: number; y: number; color: string }
  /**
   * La TV se déplace sur `camera` (zoom compris), y reste `durationMs`, puis
   * revient à la caméra de l'état. Rien n'est persisté.
   */
  | { kind: 'focus'; camera: Camera; durationMs: number }
  /** Le plateau tremble pendant `durationMs`, en s'écartant d'au plus `amplitude` cases. */
  | { kind: 'shake'; durationMs: number; amplitude: number }
  /** Explosion (feu, fumée, onde de choc) centrée sur (`x`, `y`), de rayon `radius`, en cases. */
  | { kind: 'explosion'; x: number; y: number; radius: number };

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
