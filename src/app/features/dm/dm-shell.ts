import { JsonPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';

import { BoardPreview } from './board-preview/board-preview';
import { MapsPanel } from './maps/maps-panel';
import { PlayersPanel } from './players-panel/players-panel';
import { GameStore } from './state/game.store';

const BOARD_WINDOW_NAME = 'table-jdr-board';

type DmTab = 'players' | 'maps';

@Component({
  selector: 'app-dm-shell',
  imports: [BoardPreview, JsonPipe, MapsPanel, PlayersPanel],
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

      <div class="grid gap-2">
        <nav role="tablist" aria-label="Panneaux du MJ" class="flex gap-1 border-b border-border">
          @for (t of tabs(); track t.id) {
            <button
              type="button"
              role="tab"
              class="-mb-px cursor-pointer border-b-2 px-3 py-1.5 font-semibold"
              [class.border-accent]="tab() === t.id"
              [class.border-transparent]="tab() !== t.id"
              [class.text-muted]="tab() !== t.id"
              [attr.aria-selected]="tab() === t.id"
              (click)="tab.set(t.id)"
            >
              {{ t.label }}
              <span class="ml-1 text-sm font-normal text-muted">{{ t.count }}</span>
            </button>
          }
        </nav>

        @switch (tab()) {
          @case ('players') {
            <app-players-panel role="tabpanel" />
          }
          @case ('maps') {
            <app-maps-panel role="tabpanel" />
          }
        }
      </div>

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

      <details class="panel col-span-full">
        <summary class="cursor-pointer">Ce que reçoit le plateau</summary>
        <pre class="mt-2 max-h-75 overflow-auto text-xs">{{ store.boardView() | json }}</pre>
      </details>
    </main>
  `,
})
export class DmShell {
  protected readonly store = inject(GameStore);

  protected readonly tab = signal<DmTab>('players');
  protected readonly tabs = computed(() => [
    { id: 'players' as const, label: 'Joueurs', count: this.store.players().length },
    { id: 'maps' as const, label: 'Cartes', count: this.store.maps().length },
  ]);

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
