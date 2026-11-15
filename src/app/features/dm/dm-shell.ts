import { JsonPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { BoardPreview } from './board-preview/board-preview';
import { MapsPanel } from './maps/maps-panel';
import { PlayersPanel } from './players-panel/players-panel';
import { DmSyncEffects } from './state/dm-sync.effects';
import { GameStore } from './state/game.store';

const BOARD_WINDOW_NAME = 'table-jdr-board';

type DmTab = 'players' | 'maps';

@Component({
  selector: 'app-dm-shell',
  imports: [BoardPreview, JsonPipe, MapsPanel, PlayersPanel, RouterLink],
  host: { class: 'block min-h-screen px-6 py-4' },
  template: `
    <header class="mb-4 flex items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-3">
        <a routerLink="/" class="btn shrink-0" title="Retour à la liste des sessions">← Sessions</a>
        <h1 class="truncate text-2xl font-bold">
          Vue MJ
          @if (session(); as session) {
            <span class="font-normal text-muted">· {{ session.name }}</span>
          }
        </h1>
      </div>
      <button type="button" class="btn shrink-0" (click)="openBoard()">Ouvrir le plateau</button>
    </header>

    @if (session()) {
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
    } @else {
      <p class="text-muted">Chargement de la session…</p>
    }
  `,
})
export class DmShell {
  /** Identifiant de la session, lu dans l'URL (/dm/:sessionId). */
  readonly sessionId = input.required<string>();

  protected readonly store = inject(GameStore);
  private readonly effects = inject(DmSyncEffects);
  private readonly router = inject(Router);

  protected readonly session = this.effects.session;
  protected readonly tab = signal<DmTab>('players');
  protected readonly tabs = computed(() => [
    { id: 'players' as const, label: 'Joueurs', count: this.store.players().length },
    { id: 'maps' as const, label: 'Cartes', count: this.store.maps().length },
  ]);

  constructor() {
    // Le composant est réutilisé si seule la session de l'URL change.
    effect(() => {
      const id = this.sessionId();
      untracked(() => {
        void this.effects.open(id).then((found) => {
          // Session supprimée (ou lien périmé) : retour à la liste.
          if (!found) void this.router.navigate(['/']);
        });
      });
    });
  }

  protected openBoard(): void {
    // Nom de fenêtre fixe : un second clic réutilise la fenêtre déjà ouverte.
    window.open('/board', BOARD_WINDOW_NAME);
  }

  protected onNotesInput(event: Event): void {
    this.store.setDmNotes((event.target as HTMLTextAreaElement).value);
  }
}
