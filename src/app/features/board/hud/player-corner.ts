import { Component, input } from '@angular/core';

import type { HudTheme, Player } from '../../../core/models/game-state.model';
import { ClassicCard } from './classic-card';
import { FantasyCard } from './fantasy-card';
import { ScifiCard } from './scifi-card';

/**
 * HUD d'un joueur, dans le style choisi par le MJ (`hudTheme`). Tourné vers
 * lui : nom, PV et PO. À gauche, pour les joueurs d'en face (donc à
 * l'envers) : le portrait de son personnage (s'il en a un) et son nom.
 */
@Component({
  selector: 'app-player-corner',
  imports: [ClassicCard, FantasyCard, ScifiCard],
  host: {
    class: 'block',
    '[attr.data-theme]': 'theme()',
    '[class.opacity-50]': 'player().hp === 0',
    '[style.--player-color]': 'player().color',
  },
  template: `
    @switch (theme()) {
      @case ('fantasy') {
        <app-fantasy-card [player]="player()" />
      }
      @case ('scifi') {
        <app-scifi-card [player]="player()" />
      }
      @default {
        <app-classic-card [player]="player()" />
      }
    }
  `,
})
export class PlayerCorner {
  readonly player = input.required<Player>();
  readonly theme = input<HudTheme>('classic');
}
