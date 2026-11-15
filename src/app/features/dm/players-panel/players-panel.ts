import { Component, inject } from '@angular/core';

import { SEATS, SEAT_LABELS, type Seat } from '../../../core/models/game-state.model';
import { GameStore, type PlayerPatch } from '../state/game.store';

@Component({
  selector: 'app-players-panel',
  template: `
    <section class="panel">
      <header class="flex items-center justify-between">
        <h2 class="text-lg font-semibold">Joueurs</h2>
        <button type="button" class="btn" (click)="store.addPlayer()">+ Ajouter</button>
      </header>

      @for (player of store.players(); track player.id) {
        <article
          class="mt-3 grid gap-2 rounded-md border-l-4 border-l-(--player-color) bg-surface-2 p-3"
          [style.--player-color]="player.color"
        >
          <div class="flex items-center gap-1.5">
            <input
              type="color"
              aria-label="Couleur"
              class="size-8 cursor-pointer border-0 bg-transparent p-0"
              [value]="player.color"
              (input)="setText(player.id, 'color', $event)"
            />
            <input
              aria-label="Nom"
              class="field flex-1 font-semibold"
              [value]="player.name"
              (change)="setText(player.id, 'name', $event)"
            />
            <select
              aria-label="Place à table"
              class="field"
              (change)="setSeat(player.id, $event)"
            >
              @for (seat of seats; track seat) {
                <option [value]="seat" [selected]="seat === player.seat">
                  {{ seatLabels[seat] }}
                </option>
              }
            </select>
            <button
              type="button"
              class="btn btn-danger"
              aria-label="Retirer le joueur"
              (click)="store.removePlayer(player.id)"
            >
              ✕
            </button>
          </div>

          <div class="flex items-center gap-1.5">
            <span class="w-8 font-semibold text-muted">PV</span>
            @for (step of hpSteps.down; track step) {
              <button type="button" class="btn" (click)="store.adjustHp(player.id, step)">
                {{ formatStep(step) }}
              </button>
            }
            <input
              type="number"
              aria-label="Points de vie"
              class="field w-18 text-center"
              [value]="player.hp"
              (change)="setNumber(player.id, 'hp', $event)"
            />
            <span>/</span>
            <input
              type="number"
              aria-label="Points de vie max"
              class="field w-18 text-center"
              [value]="player.hpMax"
              (change)="setNumber(player.id, 'hpMax', $event)"
            />
            @for (step of hpSteps.up; track step) {
              <button type="button" class="btn" (click)="store.adjustHp(player.id, step)">
                {{ formatStep(step) }}
              </button>
            }
          </div>

          <div class="flex items-center gap-1.5">
            <span class="w-8 font-semibold text-muted">PO</span>
            @for (step of goldSteps.down; track step) {
              <button type="button" class="btn" (click)="store.adjustGold(player.id, step)">
                {{ formatStep(step) }}
              </button>
            }
            <input
              type="number"
              aria-label="Pièces d'or"
              class="field w-18 text-center"
              [value]="player.gold"
              (change)="setNumber(player.id, 'gold', $event)"
            />
            @for (step of goldSteps.up; track step) {
              <button type="button" class="btn" (click)="store.adjustGold(player.id, step)">
                {{ formatStep(step) }}
              </button>
            }
          </div>
        </article>
      } @empty {
        <p class="mt-3 text-sm text-muted">Aucun joueur pour l'instant.</p>
      }
    </section>
  `,
})
export class PlayersPanel {
  protected readonly store = inject(GameStore);
  protected readonly seats = SEATS;
  protected readonly seatLabels = SEAT_LABELS;

  protected readonly hpSteps = { down: [-5, -1], up: [1, 5] };
  protected readonly goldSteps = { down: [-10, -1], up: [1, 10] };

  protected formatStep(step: number): string {
    return step > 0 ? `+${step}` : `−${-step}`;
  }

  protected setText(id: string, field: 'name' | 'color', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.store.updatePlayer(id, { [field]: value } as PlayerPatch);
  }

  protected setNumber(id: string, field: 'hp' | 'hpMax' | 'gold', event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isNaN(value)) return;
    this.store.updatePlayer(id, { [field]: value } as PlayerPatch);
  }

  protected setSeat(id: string, event: Event): void {
    const seat = (event.target as HTMLSelectElement).value as Seat;
    this.store.updatePlayer(id, { seat });
  }
}
