import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import type { BoardView } from '../../core/models/board-view.model';
import { SyncService } from '../../core/sync/sync.service';

/** État en lecture seule côté plateau, alimenté uniquement par le MJ. */
@Injectable()
export class BoardState {
  private readonly sync = inject(SyncService);

  readonly view = signal<BoardView | null>(null);
  readonly events$ = this.sync.on('event').pipe(map((message) => message.payload));

  constructor() {
    this.sync
      .on('state')
      .pipe(takeUntilDestroyed())
      .subscribe((message) => this.view.set(message.payload));

    // Si la vue MJ est déjà ouverte, elle répond avec l'état complet.
    // Sinon, elle l'enverra d'elle-même à son démarrage.
    this.sync.send({ type: 'hello' });
  }
}
