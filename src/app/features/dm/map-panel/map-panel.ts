import { Component, computed, inject, resource, signal } from '@angular/core';

import type { GridConfig } from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';
import { fitGridToMap, guessMapGrid } from './map-grid';

type GridField = keyof GridConfig;

@Component({
  selector: 'app-map-panel',
  template: `
    <section class="panel grid gap-3">
      <header class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">Carte</h2>
        <div class="flex gap-2">
          <label class="btn" [class.pointer-events-none]="importing()" [class.opacity-50]="importing()">
            {{ importing() ? 'Import…' : 'Importer' }}
            <input
              type="file"
              accept="image/*"
              class="sr-only"
              [disabled]="importing()"
              (change)="onFileSelected($event)"
            />
          </label>
          @if (store.mapAssetId()) {
            <button type="button" class="btn btn-danger" (click)="removeMap()">Retirer</button>
          }
        </div>
      </header>

      @if (error(); as message) {
        <p role="alert" class="text-sm text-danger">{{ message }}</p>
      }

      @if (map(); as map) {
        <p class="truncate text-sm text-muted" [title]="map.name">
          {{ map.name }} · {{ map.width }} × {{ map.height }} px
        </p>
      } @else if (!store.mapAssetId()) {
        <p class="text-sm text-muted">Aucune carte : la grille s'affiche sur un fond uni.</p>
      }

      <div class="grid grid-cols-2 gap-2 text-sm">
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

        @if (store.mapAssetId()) {
          <label class="col-span-full grid gap-1">
            <span class="text-muted">Taille d'une case dans l'image (px)</span>
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
        }
      </div>

      @if (map(); as map) {
        <button type="button" class="btn justify-self-start" (click)="fitToMap(map)">
          Ajuster la grille à la carte
        </button>
      }
    </section>
  `,
})
export class MapPanel {
  protected readonly store = inject(GameStore);
  private readonly assets = inject(AssetRepository);

  protected readonly grid = this.store.grid;
  protected readonly importing = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Nom et dimensions de la carte actuelle, lus dans IndexedDB. */
  private readonly mapInfo = resource({
    params: () => this.store.mapAssetId() ?? undefined,
    loader: ({ params }) => this.assets.getInfo(params),
  });
  protected readonly map = computed(() => (this.mapInfo.hasValue() ? this.mapInfo.value() : null));

  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    // Permet de réimporter le même fichier juste après.
    input.value = '';
    if (!file) return;

    this.error.set(null);
    this.importing.set(true);
    try {
      // L'image est en base avant que l'état (et donc le plateau) ne la référence.
      const asset = await this.assets.addImage(file, file.name);
      this.store.setMap(asset.id, guessMapGrid(asset, file.name, this.grid().cols));
    } catch (err) {
      console.error("Échec de l'import de la carte", err);
      this.error.set("Impossible d'importer ce fichier : est-ce bien une image ?");
    } finally {
      this.importing.set(false);
    }
  }

  protected removeMap(): void {
    if (confirm('Retirer la carte ? Le brouillard sera réinitialisé.')) {
      this.store.setMap(null);
    }
  }

  protected fitToMap(map: { width: number; height: number }): void {
    const { mapCellPx, offsetX, offsetY } = this.grid();
    this.store.updateGrid(fitGridToMap(map, mapCellPx, offsetX, offsetY));
  }

  protected setGrid(field: GridField, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    if (Number.isNaN(value)) return;
    this.store.updateGrid({ [field]: value });
  }
}
