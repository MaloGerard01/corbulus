import type { Routes } from '@angular/router';

import { BoardState } from './board-state';
import { EffectSounds } from './effect-sounds';

export const BOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Plateau · Table JDR',
    providers: [BoardState, EffectSounds],
    loadComponent: () => import('./board-shell').then((m) => m.BoardShell),
  },
];
