import { Component, computed, inject, resource } from '@angular/core';

import type { GridConfig } from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';
import { fitGridToMap } from './map-grid';

type GridField = keyof GridConfig;

/**
 * Propriétés de la carte en édition : on la prépare sans que les joueurs la
 * voient, puis on choisit de l'afficher à l'écran.
 */
@Component({
  selector: 'app-map-settings',
  host: { class: 'grid gap-3' },
  template: `
    @if (store.selectedMap(); as map) {
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="min-w-0">
          <h3 class="truncate font-semibold" [title]="map.name">{{ map.name }}</h3>
          <p class="text-sm text-muted">
            {{ onScreen() ? "Affichée à l'écran" : 'Non affichée' }}
            @if (image(); as image) {
              · {{ image.width }} × {{ image.height }} px
            }
          </p>
        </div>
        @if (onScreen()) {
          <button type="button" class="btn btn-danger" (click)="store.activateMap(null)">
            Retirer de l'écran
          </button>
        } @else {
          <button type="button" class="btn-primary" (click)="store.activateMap(map.id)">
            Afficher à l'écran
          </button>
        }
      </div>
    }

    <div class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
      <label class="grid gap-1">
        <span class="text-muted">Colonnes</span>
        <input
          type="number"
          min="1"
          class="field"
          [value]="grid().cols"
          (change)="setGrid('cols', $event)"
        />
      </label>
      <label class="grid gap-1">
        <span class="text-muted">Lignes</span>
        <input
          type="number"
          min="1"
          class="field"
          [value]="grid().rows"
          (change)="setGrid('rows', $event)"
        />
      </label>
      <label class="grid gap-1">
        <span class="text-muted">Case dans l'image (px)</span>
        <input
          type="number"
          min="1"
          step="any"
          class="field"
          [value]="grid().mapCellPx"
          (change)="setGrid('mapCellPx', $event)"
        />
      </label>
      <label class="grid gap-1">
        <span class="text-muted">Décalage X (cases)</span>
        <input
          type="number"
          step="0.1"
          class="field"
          [value]="grid().offsetX"
          (change)="setGrid('offsetX', $event)"
        />
      </label>
      <label class="grid gap-1">
        <span class="text-muted">Décalage Y (cases)</span>
        <input
          type="number"
          step="0.1"
          class="field"
          [value]="grid().offsetY"
          (change)="setGrid('offsetY', $event)"
        />
      </label>
    </div>

    @if (image(); as image) {
      <button type="button" class="btn justify-self-start" (click)="fitToMap(image)">
        Ajuster la grille à la carte
      </button>
    }
  `,
})
export class MapSettings {
  protected readonly store = inject(GameStore);
  private readonly assets = inject(AssetRepository);

  protected readonly grid = this.store.grid;
  protected readonly onScreen = computed(() => {
    const selected = this.store.selectedMap();
    return selected !== null && selected.id === this.store.activeMap()?.id;
  });

  /** Dimensions de l'image en édition, lues dans IndexedDB. */
  private readonly imageInfo = resource({
    params: () => this.store.selectedMap()?.assetId,
    loader: ({ params }) => this.assets.getInfo(params),
  });
  protected readonly image = computed(() =>
    this.imageInfo.hasValue() ? this.imageInfo.value() : null,
  );

  protected fitToMap(image: { width: number; height: number }): void {
    const { mapCellPx, offsetX, offsetY } = this.grid();
    this.store.updateGrid(fitGridToMap(image, mapCellPx, offsetX, offsetY));
  }

  protected setGrid(field: GridField, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isNaN(value)) return;
    this.store.updateGrid({ [field]: value });
  }
}
