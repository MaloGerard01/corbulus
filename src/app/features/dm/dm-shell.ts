import { JsonPipe } from '@angular/common';
import { Component, inject } from '@angular/core';

import { BoardPreview } from './board-preview/board-preview';
import { MapPanel } from './map-panel/map-panel';
import { PlayersPanel } from './players-panel/players-panel';
import { GameStore } from './state/game.store';

const BOARD_WINDOW_NAME = 'table-jdr-board';

@Component({
  selector: 'app-dm-shell',
  imports: [BoardPreview, JsonPipe, MapPanel, PlayersPanel],
  host: { class: 'block min-h-screen px-6 py-4' },
  template: `
    <header class="mb-4 flex items-center justify-between">
      <h1 class="text-2xl font-bold">Vue MJ</h1>
      <div class="flex gap-2">
        <button type="button" class="btn" (click)="openBoard()">Ouvrir le plateau</button>
        <button type="button" class="btn btn-danger" (click)="resetSession()">
          Nouvelle session
        </button>
      </div>
    </header>

    <main class="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-start gap-4">
      <app-board-preview class="col-span-full" />

      <app-players-panel />

      <div class="grid gap-4">
        <app-map-panel />

        <section class="panel">
          <h2 class="text-lg font-semibold">Notes du MJ</h2>
          <p class="mt-1 mb-3 text-sm text-muted">Jamais envoyées au plateau.</p>
          <textarea
            rows="8"
            class="field w-full resize-y"
            [value]="store.dmNotes()"
            (input)="onNotesInput($event)"
          ></textarea>
        </section>
      </div>

      <details class="panel col-span-full">
        <summary class="cursor-pointer">Ce que reçoit le plateau</summary>
        <pre class="mt-2 max-h-75 overflow-auto text-xs">{{ store.boardView() | json }}</pre>
      </details>
    </main>
  `,
})
export class DmShell {
  protected readonly store = inject(GameStore);

  protected openBoard(): void {
    // Nom de fenêtre fixe : un second clic réutilise la fenêtre déjà ouverte.
    window.open('/board', BOARD_WINDOW_NAME);
  }

  protected resetSession(): void {
    if (confirm('Effacer la session en cours ?')) {
      this.store.reset();
    }
  }

  protected onNotesInput(event: Event): void {
    this.store.setDmNotes((event.target as HTMLTextAreaElement).value);
  }
}
