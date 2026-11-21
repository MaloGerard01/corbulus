import { Component, computed, effect, inject, input, resource, signal } from '@angular/core';

import { AssetRepository } from '../core/persistence/asset.repository';

/**
 * Vignette d'un fichier importé (IndexedDB), en `object-cover` : remplit son
 * conteneur, qui en fixe la taille et la forme (bulle du portrait…).
 */
@Component({
  selector: 'app-asset-thumbnail',
  host: { class: 'block overflow-hidden' },
  template: `
    @if (url(); as url) {
      <img [src]="url" [alt]="alt()" class="size-full object-cover" />
    }
  `,
})
export class AssetThumbnail {
  readonly assetId = input.required<string>();
  readonly alt = input('');

  private readonly assets = inject(AssetRepository);
  private readonly preview = resource({
    params: () => this.assetId(),
    loader: ({ params }) => this.assets.getPreview(params),
  });
  private readonly thumbnail = computed(() =>
    this.preview.hasValue() ? (this.preview.value()?.thumbnail ?? null) : null,
  );

  protected readonly url = signal<string | null>(null);

  constructor() {
    // Une URL blob: par vignette, libérée quand elle change ou que le composant disparaît.
    effect((onCleanup) => {
      const thumbnail = this.thumbnail();
      if (!thumbnail) {
        this.url.set(null);
        return;
      }
      const url = URL.createObjectURL(thumbnail);
      this.url.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
}
