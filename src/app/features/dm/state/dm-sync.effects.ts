import { DestroyRef, Injectable, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { debounceTime, filter, map } from 'rxjs';

import type { GameState } from '../../../core/models/game-state.model';
import type { BoardEvent, BoardViewport } from '../../../core/models/sync-message.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { SessionRepository, type LoadedSession } from '../../../core/persistence/session.repository';
import { SyncService } from '../../../core/sync/sync.service';
import { GameStore } from './game.store';

/** Session ouverte dans la vue MJ. */
export interface OpenSession {
  id: string;
  name: string;
}

/**
 * Effets de bord côté MJ : session ouverte (chargement, sauvegarde auto) et
 * diffusion vers le plateau. Instancié au chargement de la route /dm (voir
 * dm.routes.ts), détruit en la quittant.
 */
@Injectable()
export class DmSyncEffects {
  private readonly store = inject(GameStore);
  private readonly sync = inject(SyncService);
  private readonly sessions = inject(SessionRepository);
  private readonly assets = inject(AssetRepository);

  private readonly _session = signal<OpenSession | null>(null);
  /** Session ouverte ; `null` pendant un chargement (rien n'est alors sauvegardé). */
  readonly session = this._session.asReadonly();

  /** Dernier état écrit en base pour la session ouverte : inutile de le réécrire. */
  private savedState: GameState | null = null;
  /** Numéro du dernier `open()` : un chargement dépassé par un autre est ignoré. */
  private openRequest = 0;

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

    // Sauvegarde automatique, dans la session à laquelle appartient l'état
    // (relevée avant le délai : changer de session entre-temps ne la trompe pas).
    toObservable(this.store.state)
      .pipe(
        filter((state) => this._session() !== null && state !== this.savedState),
        map((state) => ({ id: this._session()!.id, state })),
        debounceTime(500),
        takeUntilDestroyed(),
      )
      .subscribe(({ id, state }) => void this.save(id, state));

    // Quitter la vue MJ : on n'attend pas le délai de sauvegarde.
    inject(DestroyRef).onDestroy(() => void this.flush());
  }

  /**
   * Ouvre une session : sauvegarde celle qui était ouverte, puis charge la
   * nouvelle. Renvoie `false` si elle n'existe pas (ou plus).
   */
  async open(id: string): Promise<boolean> {
    if (this._session()?.id === id) return true;
    const request = ++this.openRequest;

    await this.flush();
    this._session.set(null);

    let loaded: LoadedSession | null = null;
    try {
      loaded = await this.sessions.load(id);
    } catch (err) {
      console.error('Impossible de charger la session', err);
    }
    // Une autre session a été demandée entre-temps : c'est elle qui compte.
    if (request !== this.openRequest) return true;
    if (!loaded) return false;

    // Déjà en base : son chargement ne doit pas déclencher de sauvegarde.
    this.savedState = loaded.state;
    this.store.load(loaded.state);
    this._session.set({ id, name: loaded.name });
    void this.pruneAssets();
    return true;
  }

  sendEvent(event: BoardEvent): void {
    this.sync.send({ type: 'event', payload: event });
  }

  /** Sauvegarde tout de suite la session ouverte, si elle a changé. */
  private async flush(): Promise<void> {
    const session = this._session();
    const state = this.store.state();
    if (session && state !== this.savedState) await this.save(session.id, state);
  }

  private async save(id: string, state: GameState): Promise<void> {
    try {
      await this.sessions.save(id, state);
      if (this._session()?.id === id) this.savedState = state;
    } catch (err) {
      console.error('Échec de la sauvegarde', err);
    }
  }

  /** Supprime les images qu'aucune session n'utilise plus. */
  private async pruneAssets(): Promise<void> {
    try {
      // La session ouverte compte aussi, même si sa dernière version n'est pas encore en base.
      const used = [...(await this.sessions.usedAssetIds()), ...this.store.maps().map((m) => m.assetId)];
      await this.assets.deleteUnused(used);
    } catch (err) {
      console.error('Échec du nettoyage des fichiers importés', err);
    }
  }
}
