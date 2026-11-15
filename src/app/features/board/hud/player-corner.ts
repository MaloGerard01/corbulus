import { Component, computed, input } from '@angular/core';

import type { Player } from '../../../core/models/game-state.model';

@Component({
  selector: 'app-player-corner',
  host: {
    class:
      'grid min-w-44 gap-1.5 rounded-lg border-2 border-(--player-color) bg-black/75 px-3 py-2.5 text-lg text-white',
    '[class.opacity-50]': 'player().hp === 0',
    '[style.--player-color]': 'player().color',
  },
  template: `
    <div class="font-bold text-(--player-color)">{{ player().name }}</div>

    <div class="h-2 overflow-hidden rounded-full bg-neutral-800">
      <div
        class="h-full transition-[width,background-color] duration-300"
        [class]="hpColorClass()"
        [style.width.%]="hpPercent()"
      ></div>
    </div>

    <div class="flex justify-between gap-4 tabular-nums">
      <span>PV {{ player().hp }} / {{ player().hpMax }}</span>
      <span>PO {{ player().gold }}</span>
    </div>
  `,
})
export class PlayerCorner {
  readonly player = input.required<Player>();

  protected readonly hpPercent = computed(() => {
    const { hp, hpMax } = this.player();
    return hpMax > 0 ? (hp / hpMax) * 100 : 0;
  });

  protected readonly hpColorClass = computed(() => {
    const percent = this.hpPercent();
    if (percent > 50) return 'bg-green-500';
    if (percent > 25) return 'bg-amber-500';
    return 'bg-red-500';
  });
}
