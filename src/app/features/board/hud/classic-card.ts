import { Component, computed, input } from '@angular/core';

import type { Player } from '../../../core/models/game-state.model';
import { AssetThumbnail } from '../../../shared/asset-thumbnail';
import { hpLevel, hpPercent, type HpLevel } from './hp';

const BAR_CLASSES: Record<HpLevel, string> = {
  high: 'bg-green-500',
  mid: 'bg-amber-500',
  low: 'bg-red-500',
  down: 'bg-red-500',
};

/** Carte « Sobre » : fond noir, bordure à la couleur du joueur. */
@Component({
  selector: 'app-classic-card',
  imports: [AssetThumbnail],
  host: { class: 'flex items-center gap-2 text-lg text-white' },
  template: `
    <!-- À l'envers : pour les joueurs d'en face, le portrait puis le nom en dessous. -->
    <div data-facing-others class="flex shrink-0 rotate-180 flex-col items-center gap-1">
      @if (player().portraitAssetId; as portrait) {
        <app-asset-thumbnail
          data-portrait
          class="size-20 rounded-full border-2 border-(--player-color) bg-black/75"
          [assetId]="portrait"
          [alt]="'Portrait de ' + player().name"
        />
      }
      <span
        class="max-w-28 truncate rounded-full border border-(--player-color) bg-black/75 px-2 text-sm font-semibold text-(--player-color)"
      >
        {{ player().name }}
      </span>
    </div>

    <div class="grid min-w-44 gap-1.5 rounded-lg border-2 border-(--player-color) bg-black/75 px-3 py-2.5">
      <div class="font-bold text-(--player-color)">{{ player().name }}</div>

      <div class="h-2 overflow-hidden rounded-full bg-neutral-800">
        <div
          class="h-full transition-[width,background-color] duration-300"
          [class]="barClass()"
          [style.width.%]="hpPercent()"
        ></div>
      </div>

      <div class="flex justify-between gap-4 tabular-nums">
        <span>PV {{ player().hp }} / {{ player().hpMax }}</span>
        <span>PO {{ player().gold }}</span>
      </div>
    </div>
  `,
})
export class ClassicCard {
  readonly player = input.required<Player>();

  protected readonly hpPercent = computed(() => hpPercent(this.player()));
  protected readonly barClass = computed(() => BAR_CLASSES[hpLevel(this.player())]);
}
