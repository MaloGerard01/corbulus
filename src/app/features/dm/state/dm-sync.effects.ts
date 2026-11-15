import { Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, filter } from 'rxjs';

import type { BoardEvent, BoardViewport } from '../../../core/models/sync-message.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { SessionRepository } from '../../../core/persistence/session.repository';
import { SyncService } from '../../../core/sync/sync.service';
import { GameStore } from './game.store';

/**
 * Effets de bord côté MJ : diffusion vers le plateau et sauvegarde auto.
 * Instancié au chargement de la route /dm (voir dm.routes.ts).
 */
@Injectable()
export class DmSyncEffects {
  private readonly store = inject(GameStore);
  private readonly sync = inject(SyncService);
  private readonly sessions = inject(SessionRepository);
  private readonly assets = inject(AssetRepository);

  /** Empêche d'écraser la sauvegarde avec l'état vide avant la restauration. */
  private restored = false;

  private readonly _boardViewport = signal<BoardViewport | null>(null);
  /**
   * Taille de la fenêtre du plateau (la TV), `null` tant qu'il ne s'est pas
   * manifesté. Information sur la fenêtre, pas sur la partie : non persistée.
   */
  readonly boardViewport = this._boardViewport.asReadonly();

  constructor() {
    // Chaque changement visible → plateau
    effect(() => {
      this.sync.send({ type: 'state', payload: this.store.boardView() });
    });

    // Le plateau (re)démarre → on lui renvoie tout
    this.sync
      .on('hello')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.sync.send({ type: 'state', payload: this.store.boardView() });
      });

    // Taille de la TV : le plateau l'envoie à son démarrage et à chaque
    // redimensionnement. S'il est déjà ouvert, on la lui redemande.
    this.sync
      .on('viewport')
      .pipe(takeUntilDestroyed())
      .subscribe((message) => this._boardViewport.set(message.payload));
    this.sync.send({ type: 'viewport-request' });

    // Sauvegarde automatique
    toObservable(this.store.state)
      .pipe(
        filter(() => this.restored),
        debounceTime(500),
        takeUntilDestroyed(),
      )
      .subscribe((state) => {
        this.sessions.saveCurrent(state).catch((err) => {
          console.error('Échec de la sauvegarde', err);
        });
      });

    void this.restore();
  }

  sendEvent(event: BoardEvent): void {
    this.sync.send({ type: 'event', payload: event });
  }

  private async restore(): Promise<void> {
    try {
      const saved = await this.sessions.loadCurrent();
      if (saved) this.store.load(saved);
    } catch (err) {
      console.error('Impossible de restaurer la session', err);
      // On ne sait pas ce que la session référence : on ne nettoie rien.
      return;
    } finally {
      this.restored = true;
    }
    await this.pruneAssets();
  }

  /** Supprime les cartes retirées de la session ou appartenant à une session effacée. */
  private async pruneAssets(): Promise<void> {
    const usedAssetIds = this.store.maps().map((m) => m.assetId);
    try {
      await this.assets.deleteUnused(usedAssetIds);
    } catch (err) {
      console.error('Échec du nettoyage des fichiers importés', err);
    }
  }
}
