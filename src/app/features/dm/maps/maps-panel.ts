import { Component, inject, signal } from '@angular/core';

import { mapNameFromFile, type SessionMap } from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';
import { MapCard } from './map-card';
import { guessMapGrid } from './map-grid';
import { MapSettings } from './map-settings';

/**
 * Onglet « Cartes » : les cartes chargées pour la session. Chacune garde sa
 * grille, sa vue et son brouillard. Cliquer une vignette la sélectionne pour
 * la préparer ; ses propriétés permettent ensuite de l'afficher à l'écran.
 */
@Component({
  selector: 'app-maps-panel',
  imports: [MapCard, MapSettings],
  template: `
    <section class="panel grid gap-4">
      <header class="flex items-center justify-between gap-2">
        <h2 class="text-lg font-semibold">Cartes de la session</h2>
        <label
          class="btn"
          [class.pointer-events-none]="importing()"
          [class.opacity-50]="importing()"
        >
          {{ importing() ? 'Import…' : '+ Importer' }}
          <input
            type="file"
            accept="image/*,video/*"
            multiple
            class="sr-only"
            [disabled]="importing()"
            (change)="onFilesSelected($event)"
          />
        </label>
      </header>

      @if (error(); as message) {
        <p role="alert" class="text-sm text-danger">{{ message }}</p>
      }

      @if (store.maps().length) {
        <div class="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-4">
          @for (map of store.maps(); track map.id) {
            <app-map-card
              [map]="map"
              [selected]="map.id === store.selectedMap()?.id"
              [active]="map.id === store.activeMap()?.id"
              [viewport]="boardViewport()"
              (select)="store.selectMap(map.id)"
              (remove)="removeMap(map)"
            />
          }
        </div>
      } @else {
        <p class="text-sm text-muted">
          Aucune carte : la TV affiche une grille vierge. Importez des images, des GIF ou des
          vidéos.
        </p>
      }

      @if (store.selectedMap()) {
        <app-map-settings class="border-t border-border pt-4" />
      }
    </section>
  `,
})
export class MapsPanel {
  protected readonly store = inject(GameStore);
  private readonly assets = inject(AssetRepository);
  /** Taille de la TV, pour montrer sur chaque vignette ce qu'elle affichera. */
  protected readonly boardViewport = inject(DmSyncEffects).boardViewport;

  protected readonly importing = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async onFilesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    // Permet de réimporter les mêmes fichiers juste après.
    input.value = '';
    if (files.length === 0) return;

    this.error.set(null);
    this.importing.set(true);
    const failed: string[] = [];
    for (const file of files) {
      try {
        // Le fichier est en base avant que l'état (et donc le plateau) ne le référence.
        const asset = await this.assets.addMedia(file, file.name);
        this.store.addMap({
          assetId: asset.id,
          name: mapNameFromFile(file.name),
          kind: asset.kind,
          // Seules les cartes fixes ont une grille ; les animées remplissent l'écran.
          grid: asset.kind === 'image' ? guessMapGrid(asset, file.name, this.store.grid().cols) : undefined,
        });
      } catch (err) {
        console.error(`Échec de l'import de ${file.name}`, err);
        failed.push(file.name);
      }
    }
    if (failed.length) {
      this.error.set(
        `Impossible d'importer ${failed.join(', ')} : est-ce bien une image, un GIF ou une vidéo lisible ?`,
      );
    }
    this.importing.set(false);
  }

  protected removeMap(map: SessionMap): void {
    if (confirm(`Retirer « ${map.name} » de la session ? Sa vue et son brouillard seront perdus.`)) {
      this.store.removeMap(map.id);
    }
  }
}
