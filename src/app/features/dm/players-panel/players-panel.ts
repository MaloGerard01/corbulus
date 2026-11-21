import { Component, inject, signal } from '@angular/core';

import {
  HUD_THEMES,
  HUD_THEME_LABELS,
  SEATS,
  SEAT_LABELS,
  type HudTheme,
  type Player,
  type Seat,
} from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { AssetThumbnail } from '../../../shared/asset-thumbnail';
import { GameStore, type PlayerPatch } from '../state/game.store';
import { HudPlacement } from '../state/hud-placement';

/** Choix « Personnalisée » de la place à table : le HUD est placé sur l'aperçu. */
const CUSTOM_SEAT = 'custom';

@Component({
  selector: 'app-players-panel',
  imports: [AssetThumbnail],
  template: `
    <section class="panel">
      <header class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">Joueurs</h2>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5 text-sm text-muted">
            Style des cartes
            <select
              aria-label="Style des cartes"
              class="field text-text"
              title="Apparence des infos de tous les joueurs sur la TV"
              (change)="onThemeChange($event)"
            >
              @for (theme of themes; track theme) {
                <option [value]="theme" [selected]="theme === store.hudTheme()">
                  {{ themeLabels[theme] }}
                </option>
              }
            </select>
          </label>
          <button type="button" class="btn" (click)="store.addPlayer()">+ Ajouter</button>
        </div>
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
              (change)="onSeatChange(player, $event)"
            >
              @for (seat of seats; track seat) {
                <option [value]="seat" [selected]="seatValue(player) === seat">
                  {{ seatLabels[seat] }}
                </option>
              }
              <option [value]="customSeat" [selected]="seatValue(player) === customSeat">
                Personnalisée
              </option>
            </select>
            @if (placement.playerId() === player.id) {
              <button type="button" class="btn" (click)="placement.cancel()">Annuler</button>
            } @else if (player.seatPosition !== null) {
              <button
                type="button"
                class="btn"
                aria-label="Déplacer les infos"
                title="Déplacer les infos du joueur sur l'aperçu"
                (click)="placement.start(player.id)"
              >
                📍
              </button>
            }
            <button
              type="button"
              class="btn btn-danger"
              aria-label="Retirer le joueur"
              (click)="store.removePlayer(player.id)"
            >
              ✕
            </button>
          </div>

          @if (placement.playerId() === player.id) {
            <p data-placement-hint class="text-sm text-accent">
              Cliquez près d'un bord de l'écran, dans l'aperçu, pour y placer les infos. Échap pour
              annuler.
            </p>
          }

          <div class="flex items-center gap-1.5">
            <button
              type="button"
              class="grid size-10 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-full border-2 border-(--player-color) bg-surface-1 text-lg disabled:cursor-wait"
              [title]="player.portraitAssetId ? 'Changer le portrait' : 'Ajouter un portrait'"
              [disabled]="importingPortrait() === player.id"
              (click)="portraitInput.click()"
            >
              @if (player.portraitAssetId; as portrait) {
                <app-asset-thumbnail class="size-full" [assetId]="portrait" alt="" />
              } @else {
                <span aria-hidden="true" class="text-muted">👤</span>
              }
            </button>
            <button
              type="button"
              class="btn"
              [disabled]="importingPortrait() === player.id"
              (click)="portraitInput.click()"
            >
              {{ player.portraitAssetId ? 'Changer le portrait' : 'Ajouter un portrait' }}
            </button>
            @if (player.portraitAssetId) {
              <button
                type="button"
                class="btn"
                (click)="store.updatePlayer(player.id, { portraitAssetId: null })"
              >
                Retirer
              </button>
            }
            <input
              #portraitInput
              type="file"
              accept="image/*"
              aria-label="Portrait du personnage"
              class="hidden"
              (change)="onPortraitSelected(player.id, $event)"
            />
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
  protected readonly placement = inject(HudPlacement);
  private readonly assets = inject(AssetRepository);
  protected readonly seats = SEATS;
  protected readonly seatLabels = SEAT_LABELS;
  protected readonly customSeat = CUSTOM_SEAT;
  protected readonly themes = HUD_THEMES;
  protected readonly themeLabels = HUD_THEME_LABELS;
  /** Joueur dont le portrait est en cours d'import. */
  protected readonly importingPortrait = signal<string | null>(null);

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

  protected onThemeChange(event: Event): void {
    this.store.setHudTheme((event.target as HTMLSelectElement).value as HudTheme);
  }

  /** Choix affiché : « Personnalisée » pendant le placement et une fois placé. */
  protected seatValue(player: Player): Seat | typeof CUSTOM_SEAT {
    const custom = player.seatPosition !== null || this.placement.playerId() === player.id;
    return custom ? CUSTOM_SEAT : player.seat;
  }

  protected onSeatChange(player: Player, event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    // La place personnalisée n'est enregistrée qu'au clic sur l'aperçu.
    if (value === CUSTOM_SEAT) {
      this.placement.start(player.id);
      return;
    }
    if (this.placement.playerId() === player.id) this.placement.cancel();
    this.store.updatePlayer(player.id, { seat: value as Seat, seatPosition: null });
  }

  /** Le fichier est mis en base avant d'être référencé par le joueur. */
  protected async onPortraitSelected(playerId: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Pour pouvoir choisir à nouveau le même fichier.
    input.value = '';
    if (!file) return;

    this.importingPortrait.set(playerId);
    try {
      const asset = await this.assets.addMedia(file, file.name);
      this.store.updatePlayer(playerId, { portraitAssetId: asset.id });
    } catch (err) {
      console.error("Impossible d'importer le portrait", err);
    } finally {
      this.importingPortrait.set(null);
    }
  }
}
