import { Component, computed, input } from '@angular/core';

import type { Player } from '../../../core/models/game-state.model';
import { AssetThumbnail } from '../../../shared/asset-thumbnail';
import { hpLevel, hpPercent, type HpLevel } from './hp';

const BAR_COLORS: Record<HpLevel, string> = {
  high: '#4a9d5b',
  mid: '#d9922e',
  low: '#c0392b',
  down: '#c0392b',
};

/** Losanges dorés aux quatre coins de la carte. */
const CORNERS = ['-top-2 -left-2', '-top-2 -right-2', '-bottom-2 -left-2', '-bottom-2 -right-2'];

/**
 * Carte « Médiéval-fantastique » : cuir sombre, double filet doré, gemme et
 * médaillon à la couleur du joueur, nom à l'envers sur une banderole.
 */
@Component({
  selector: 'app-fantasy-card',
  imports: [AssetThumbnail],
  host: { class: 'flex items-center gap-3.5 font-fantasy text-parchment' },
  template: `
    <!-- À l'envers : pour les joueurs d'en face, le médaillon puis la banderole du nom. -->
    <div data-facing-others class="flex shrink-0 rotate-180 flex-col items-center gap-1.5">
      @if (player().portraitAssetId; as portrait) {
        <div class="size-[92px] rounded-full bg-gilt p-[3px] shadow-[0_0_0_2px_#3a2a14,0_6px_14px_rgb(0_0_0/0.55)]">
          <app-asset-thumbnail
            data-portrait
            class="size-full rounded-full border-3 border-(--player-color) bg-[#3b2c1e]"
            [assetId]="portrait"
            [alt]="'Portrait de ' + player().name"
          />
        </div>
      }
      <span
        class="clip-ribbon max-w-36 truncate bg-(--player-color) px-5 py-1 font-fantasy-display text-[15px] font-bold tracking-wide text-[#140d06]"
      >
        {{ player().name }}
      </span>
    </div>

    <div
      class="fantasy-frame relative grid w-80 gap-[11px] rounded-md border-2 border-gilt bg-leather px-5 pt-4 pb-3.5"
    >
      @for (corner of corners; track corner) {
        <svg aria-hidden="true" viewBox="0 0 14 14" class="absolute size-3.5" [class]="corner">
          <path d="M7 0 14 7 7 14 0 7z" class="fill-gilt stroke-leather" stroke-width="2" />
        </svg>
      }

      <div class="flex min-w-0 items-center gap-[11px]">
        <span
          class="size-[13px] shrink-0 rotate-45 border-2 border-[#ecd59a] bg-(--player-color) shadow-[0_0_0_1px_#241a12]"
        ></span>
        <span class="truncate font-fantasy-display text-[23px] font-bold tracking-wide">
          {{ player().name }}
        </span>
      </div>

      <div
        class="h-3 overflow-hidden rounded-full bg-[#120c07] shadow-[inset_0_1px_3px_rgb(0_0_0/0.85),0_0_0_1px_#6b5126]"
      >
        <div
          class="h-full rounded-full shadow-[inset_0_1px_0_rgb(255_255_255/0.28)] transition-[width,background-color] duration-300"
          [style.width.%]="hpPercent()"
          [style.background-color]="barColor()"
        ></div>
      </div>

      <div class="flex items-center justify-between gap-4 text-[21px] font-semibold tabular-nums">
        <span class="flex items-center gap-[7px]">
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-[18px]">
            <path
              d="M12 21s-7.5-4.6-9.5-9.2C1 8.3 3.2 4.5 7 4.5c2.1 0 3.6 1.1 5 3 1.4-1.9 2.9-3 5-3 3.8 0 6 3.8 4.5 7.3C19.5 16.4 12 21 12 21z"
              fill="#c0392b"
              class="stroke-parchment"
              stroke-width="1.3"
            />
          </svg>
          <span class="font-fantasy-display text-sm font-bold text-gilt">PV</span>
          <span>{{ player().hp }} / {{ player().hpMax }}</span>
        </span>
        <span class="flex items-center gap-[7px]">
          <svg aria-hidden="true" viewBox="0 0 24 24" class="size-[18px]">
            <circle cx="12" cy="12" r="10" fill="#d4ad52" stroke="#7a5a1e" stroke-width="1.6" />
            <circle cx="12" cy="12" r="5.5" fill="none" stroke="#7a5a1e" stroke-width="1.6" />
          </svg>
          <span class="font-fantasy-display text-sm font-bold text-gilt">PO</span>
          <span>{{ player().gold }}</span>
        </span>
      </div>
    </div>
  `,
})
export class FantasyCard {
  readonly player = input.required<Player>();

  protected readonly corners = CORNERS;
  protected readonly hpPercent = computed(() => hpPercent(this.player()));
  protected readonly barColor = computed(() => BAR_COLORS[hpLevel(this.player())]);
}
