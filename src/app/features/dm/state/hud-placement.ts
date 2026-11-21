import { Injectable, signal } from '@angular/core';

/**
 * Placement du HUD d'un joueur à une position personnalisée : lancé depuis
 * le panneau des joueurs, réalisé sur l'aperçu (clic sur le bord de la TV).
 * Interface du MJ seulement : ni sauvegardé, ni envoyé au plateau.
 */
@Injectable()
export class HudPlacement {
  private readonly _playerId = signal<string | null>(null);
  /** Joueur dont on place le HUD (`null` : aucun placement en cours). */
  readonly playerId = this._playerId.asReadonly();

  start(playerId: string): void {
    this._playerId.set(playerId);
  }

  cancel(): void {
    this._playerId.set(null);
  }
}
