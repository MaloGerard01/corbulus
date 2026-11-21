import { Component, computed, input } from '@angular/core';

import type { Player } from '../../../core/models/game-state.model';
import { AssetThumbnail } from '../../../shared/asset-thumbnail';
import { hpLevel, hpPercent, type HpLevel } from './hp';

/** Couleur de la jauge et de l'état, et libellé de l'état. */
const LEVELS: Record<HpLevel, { color: string; label: string }> = {
  high: { color: '#34d399', label: 'Opérationnel' },
  mid: { color: '#fbbf24', label: 'Blessé' },
  low: { color: '#f43f5e', label: 'Critique' },
  down: { color: '#64748b', label: 'Hors combat' },
};

/** Segments de la jauge : un pour chaque dixième des PV max. */
const SEGMENTS = 10;
const EMPTY_SEGMENT = { fill: '#0f1a24', border: 'var(--color-hull-line)' };

/**
 * Carte « Science-fiction » : panneau à coins coupés et liseré lumineux à la
 * couleur du joueur, jauge segmentée, état du personnage, crédits (CR) à la
 * place des pièces d'or, portrait hexagonal.
 */
@Component({
  selector: 'app-scifi-card',
  imports: [AssetThumbnail],
  host: { class: 'flex items-center gap-3.5 font-scifi text-[#dbe7f0]' },
  template: `
    <!-- À l'envers : pour les joueurs d'en face, le portrait puis l'étiquette du nom. -->
    <div data-facing-others class="scifi-glow flex shrink-0 rotate-180 flex-col items-center gap-[7px]">
      @if (player().portraitAssetId; as portrait) {
        <div class="clip-hex h-[86px] w-[98px] bg-(--player-color) p-[3px]">
          <div class="clip-hex relative size-full overflow-hidden bg-[#101b26]">
            <app-asset-thumbnail
              data-portrait
              class="size-full"
              [assetId]="portrait"
              [alt]="'Portrait de ' + player().name"
            />
            <div class="scanlines pointer-events-none absolute inset-0"></div>
          </div>
        </div>
      }
      <div class="clip-chamfer-sm bg-(--player-color) p-[1.5px]">
        <div
          class="clip-chamfer-sm-inner max-w-36 truncate bg-hull px-3.5 py-[3px] font-scifi-display text-[13px] font-bold tracking-widest text-(--player-color) uppercase"
        >
          {{ player().name }}
        </div>
      </div>
    </div>

    <div class="scifi-glow">
      <div class="clip-chamfer w-[330px] bg-(--player-color) p-0.5">
        <div class="clip-chamfer-inner relative grid gap-2.5 bg-hull pt-3.5 pr-[18px] pb-[13px] pl-[22px]">
          <span class="absolute top-1.5 right-1.5 size-3 border-t-2 border-r-2 border-(--player-color)"></span>
          <span class="absolute bottom-1.5 left-1.5 size-3 border-b-2 border-l-2 border-(--player-color)"></span>

          <div class="flex min-w-0 items-baseline justify-between gap-3">
            <span
              class="truncate font-scifi-display text-xl font-bold tracking-[0.08em] text-(--player-color) uppercase"
            >
              {{ player().name }}
            </span>
            <span
              data-status
              class="shrink-0 text-sm font-bold tracking-[0.12em] uppercase"
              [style.color]="level().color"
            >
              {{ level().label }}
            </span>
          </div>

          <div class="flex items-center gap-2.5">
            <span class="w-[22px] text-[15px] font-bold tracking-[0.08em] text-hud-label">PV</span>
            <div class="flex flex-1 gap-1 pl-1">
              @for (segment of segments(); track $index) {
                <span
                  class="h-[13px] flex-1 -skew-x-20 border transition-colors duration-300"
                  [style.background-color]="segment.fill"
                  [style.border-color]="segment.border"
                ></span>
              }
            </div>
            <span class="font-scifi-mono text-xl text-[#e6f1f8]">{{ hpText() }}</span>
          </div>

          <div class="flex items-center gap-2.5">
            <span class="w-[22px] text-[15px] font-bold tracking-[0.08em] text-hud-label">CR</span>
            <svg aria-hidden="true" viewBox="0 0 14 14" class="size-3.5">
              <path d="M7 1 13 7 7 13 1 7z" fill="none" stroke="#fbbf24" stroke-width="1.8" />
              <path d="M7 4.5 9.5 7 7 9.5 4.5 7z" fill="#fbbf24" />
            </svg>
            <span class="font-scifi-mono text-xl text-[#fcd56b]">{{ credits() }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ScifiCard {
  readonly player = input.required<Player>();

  protected readonly level = computed(() => LEVELS[hpLevel(this.player())]);

  protected readonly segments = computed(() => {
    const filled = Math.round(hpPercent(this.player()) / (100 / SEGMENTS));
    const lit = { fill: this.level().color, border: this.level().color };
    return Array.from({ length: SEGMENTS }, (_, i) => (i < filled ? lit : EMPTY_SEGMENT));
  });

  protected readonly hpText = computed(() => {
    const { hp, hpMax } = this.player();
    return `${pad(hp, 2)}/${pad(hpMax, 2)}`;
  });

  protected readonly credits = computed(() => pad(this.player().gold, 4));
}

function pad(value: number, digits: number): string {
  return String(value).padStart(digits, '0');
}
