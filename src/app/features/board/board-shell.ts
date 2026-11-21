import { Component, computed, inject, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { SEATS, type Player, type Seat } from '../../core/models/game-state.model';
import { AnimatedMap } from '../../shared/animated-map';
import { BoardCanvas } from '../../shared/board-canvas';
import { BoardState } from './board-state';
import { EffectSounds } from './effect-sounds';
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

/**
 * Le bandeau du haut est retourné, celui de droite tourné vers la gauche :
 * leur sens (de leur gauche à leur droite) est l'inverse de celui de l'écran.
 */
const REVERSED_SIDES: ReadonlySet<Seat> = new Set(['top', 'right']);

/**
 * HUD à une position personnalisée, dans le repère de son bandeau : `along`
 * de 0 (bout gauche du bandeau) à 1 (bout droit).
 */
interface PlacedPlayer {
  player: Player;
  along: number;
}

function placedPlayer(player: Player, seatPosition: number): PlacedPlayer {
  return { player, along: REVERSED_SIDES.has(player.seat) ? 1 - seatPosition : seatPosition };
}

@Component({
  selector: 'app-board-shell',
  imports: [AnimatedMap, BoardCanvas, PlayerCorner],
  host: {
    class: 'fixed inset-0 cursor-none overflow-hidden bg-black select-none',
    '(dblclick)': 'toggleFullscreen()',
  },
  template: `
    <app-board-canvas class="absolute inset-0" mode="board" [view]="view()" />

    <!-- Carte animée (GIF, vidéo) : plein écran, par-dessus la grille vierge. -->
    @if (view()?.animated; as media) {
      <app-animated-map class="absolute inset-0" fit="cover" [withSound]="true" [media]="media" />
    }

    @if (!view()) {
      <p class="absolute inset-0 grid place-items-center text-2xl text-neutral-600">
        En attente de la vue MJ…
      </p>
    }

    <!-- Son d'un effet refusé par le navigateur (aucun clic dans cette fenêtre). -->
    @if (sounds.blocked()) {
      <button
        type="button"
        data-unlock-sound
        class="absolute bottom-6 left-1/2 z-10 -translate-x-1/2 cursor-pointer rounded-full border-2 border-white bg-black/80 px-5 py-2 text-lg font-semibold text-white"
        (click)="sounds.unlock()"
      >
        🔇 Activer le son des effets
      </button>
    }

    <div class="pointer-events-none absolute inset-0">
      @for (side of sides(); track side.seat) {
        <div class="absolute flex justify-center gap-4 p-3" [class]="side.classes">
          @for (player of side.players; track player.id) {
            <app-player-corner [player]="player" [theme]="hudTheme()" />
          }
          <!--
            Position personnalisée : contre le bord de l'écran (bas du bandeau),
            à 0,75rem des coins au plus près, sans jamais dépasser.
          -->
          @for (placed of side.placed; track placed.player.id) {
            <app-player-corner
              class="absolute bottom-3"
              [style.left]="'calc(0.75rem + ' + placed.along + ' * (100% - 1.5rem))'"
              [style.transform]="'translateX(' + -placed.along * 100 + '%)'"
              [player]="placed.player"
              [theme]="hudTheme()"
            />
          }
        </div>
      }
    </div>
  `,
})
export class BoardShell {
  private readonly board = inject(BoardState);
  protected readonly sounds = inject(EffectSounds);
  private readonly canvas = viewChild(BoardCanvas);

  protected readonly view = this.board.view;
  /** Style des cartes des joueurs, choisi par le MJ. */
  protected readonly hudTheme = computed(() => this.view()?.hudTheme ?? 'classic');

  constructor() {
    this.sounds.preload();

    // Effets ponctuels (ping, focus…) : joués une fois, jamais stockés.
    this.board.events$.pipe(takeUntilDestroyed()).subscribe((event) => {
      this.canvas()?.playEffect(event);
      this.sounds.play(event);
    });
  }

  /** Joueurs regroupés par côté de table, pour orienter chaque bloc du HUD. */
  protected readonly sides = computed(() => {
    const players = this.view()?.players ?? [];
    return SEATS.map((seat) => ({
      seat,
      classes: SIDE_CLASSES[seat],
      // Centrés ensemble, ou chacun à sa position personnalisée.
      players: players.filter((p) => p.seat === seat && p.seatPosition === null),
      placed: players.flatMap((p) =>
        p.seat === seat && p.seatPosition !== null ? [placedPlayer(p, p.seatPosition)] : [],
      ),
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
