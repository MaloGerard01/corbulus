import { Component, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SEATS, type Seat } from '../../core/models/game-state.model';
import { BoardCanvas } from '../../shared/board-canvas';
import { BoardState } from './board-state';
import { PlayerCorner } from './hud/player-corner';

/**
 * Chaque côté est un bandeau horizontal, pivoté pour que le haut du texte
 * pointe vers le centre de la table.
 * Gauche/droite : le bandeau est placé juste au-dessus de l'écran (bottom-full),
 * fait la hauteur de l'écran en largeur, puis pivote autour de son coin bas.
 */
const SIDE_CLASSES: Record<Seat, string> = {
  bottom: 'inset-x-0 bottom-0',
  top: 'inset-x-0 top-0 rotate-180',
  left: 'bottom-full left-0 w-[100vh] origin-bottom-left rotate-90',
  right: 'bottom-full right-0 w-[100vh] origin-bottom-right -rotate-90',
};

@Component({
  selector: 'app-board-shell',
  imports: [BoardCanvas, PlayerCorner],
  host: {
    class: 'fixed inset-0 cursor-none overflow-hidden bg-black select-none',
    '(dblclick)': 'toggleFullscreen()',
  },
  template: `
    <app-board-canvas class="absolute inset-0" mode="board" [view]="view()" />

    @if (!view()) {
      <p class="absolute inset-0 grid place-items-center text-2xl text-neutral-600">
        En attente de la vue MJ…
      </p>
    }

    <div class="pointer-events-none absolute inset-0">
      @for (side of sides(); track side.seat) {
        <div class="absolute flex justify-center gap-4 p-3" [class]="side.classes">
          @for (player of side.players; track player.id) {
            <app-player-corner [player]="player" />
          }
        </div>
      }
    </div>
  `,
})
export class BoardShell {
  private readonly board = inject(BoardState);
  private readonly canvas = viewChild(BoardCanvas);

  protected readonly view = this.board.view;

  constructor() {
    // Effets ponctuels (ping, focus…) : joués une fois, jamais stockés.
    this.board.events$
      .pipe(takeUntilDestroyed())
      .subscribe((event) => this.canvas()?.playEffect(event));
  }

  /** Joueurs regroupés par côté de table, pour orienter chaque bloc du HUD. */
  protected readonly sides = computed(() => {
    const players = this.view()?.players ?? [];
    return SEATS.map((seat) => ({
      seat,
      classes: SIDE_CLASSES[seat],
      players: players.filter((p) => p.seat === seat),
    }));
  });

  protected toggleFullscreen(): void {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  }
}
