import { Component, computed, effect, inject, input, output, resource, signal } from '@angular/core';

import { MAP_KIND_LABELS, type SessionMap } from '../../../core/models/game-state.model';
import type { BoardViewport } from '../../../core/models/sync-message.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { visibleImageZone } from './visible-zone';

/**
 * Vignette d'une carte de la session : cliquer la sélectionne pour l'éditer
 * (sans l'afficher). Ce que la TV en montrera reste clair, le reste est assombri.
 */
@Component({
  selector: 'app-map-card',
  host: { class: 'flex min-w-0 flex-col gap-1.5' },
  template: `
    <!-- Image et overlay sont en absolute : ils ne dictent pas la taille de la case. -->
    <button
      type="button"
      class="relative block aspect-video w-full cursor-pointer overflow-hidden rounded-md border-2 bg-surface-0 hover:border-accent"
      [class.border-accent]="selected()"
      [class.border-border]="!selected()"
      [attr.aria-pressed]="selected()"
      [title]="selected() ? 'Carte en cours de modification' : 'Modifier cette carte'"
      (click)="select.emit()"
    >
      @if (thumbnailUrl(); as url) {
        <img [src]="url" alt="" class="absolute inset-0 size-full object-contain" />
      }

      <!-- Même cadrage que l'image (centrée, entière), en pixels de l'image. -->
      @if (overlay(); as overlay) {
        <svg
          class="pointer-events-none absolute inset-0 size-full"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
          [attr.viewBox]="overlay.viewBox"
        >
          <path fill="black" fill-opacity="0.6" fill-rule="evenodd" [attr.d]="overlay.shade" />
          <rect
            data-visible-zone
            fill="none"
            stroke="white"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
            [attr.x]="overlay.zone.x"
            [attr.y]="overlay.zone.y"
            [attr.width]="overlay.zone.w"
            [attr.height]="overlay.zone.h"
          />
        </svg>
      }

      @if (active()) {
        <span
          class="absolute top-1.5 left-1.5 rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-white"
        >
          A l'écran
        </span>
      }

      @if (map().kind !== 'image') {
        <span
          data-kind
          class="absolute right-1.5 bottom-1.5 rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold text-white"
        >
          {{ map().kind === 'video' ? '▶ ' : '' }}{{ kindLabels[map().kind] }}
        </span>
      }
    </button>

    <div class="flex items-center gap-1.5">
      <span class="min-w-0 flex-1 truncate text-sm" [title]="map().name">{{ map().name }}</span>
      <button
        type="button"
        class="btn btn-danger px-1.5 py-0 text-sm"
        title="Retirer la carte"
        [attr.aria-label]="'Retirer ' + map().name"
        (click)="remove.emit()"
      >
        ✕
      </button>
    </div>
  `,
})
export class MapCard {
  readonly map = input.required<SessionMap>();
  /** Carte en cours d'édition. */
  readonly selected = input(false);
  /** Carte affichée sur la TV. */
  readonly active = input(false);
  /** Taille de la TV ; `null` (plateau jamais ouvert) : pas d'overlay. */
  readonly viewport = input<BoardViewport | null>(null);
  readonly select = output<void>();
  readonly remove = output<void>();

  protected readonly kindLabels = MAP_KIND_LABELS;

  private readonly assets = inject(AssetRepository);

  private readonly preview = resource({
    params: () => this.map().assetId,
    loader: ({ params }) => this.assets.getPreview(params),
  });
  private readonly image = computed(() => (this.preview.hasValue() ? this.preview.value() : null));

  protected readonly thumbnailUrl = signal<string | null>(null);

  /** Zone visible sur la TV, et ce qui l'entoure, à assombrir. */
  protected readonly overlay = computed(() => {
    const viewport = this.viewport();
    const image = this.image();
    // Une carte animée remplit tout l'écran : pas de zone à montrer.
    if (!viewport || !image || this.map().kind !== 'image') return null;

    const zone = visibleImageZone(viewport, this.map(), image);
    const { width, height } = image;
    return {
      viewBox: `0 0 ${width} ${height}`,
      zone,
      // Toute l'image moins la zone visible (règle evenodd) : le hors-champ.
      shade: `M0 0H${width}V${height}H0Z M${zone.x} ${zone.y}h${zone.w}v${zone.h}h${-zone.w}Z`,
    };
  });

  constructor() {
    // Une URL blob: par vignette, libérée quand elle change ou que la carte disparaît.
    effect((onCleanup) => {
      const thumbnail = this.image()?.thumbnail;
      if (!thumbnail) {
        this.thumbnailUrl.set(null);
        return;
      }
      const url = URL.createObjectURL(thumbnail);
      this.thumbnailUrl.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }
}
