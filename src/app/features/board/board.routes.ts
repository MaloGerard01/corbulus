import type { Routes } from '@angular/router';

import { BoardState } from './board-state';

export const BOARD_ROUTES: Routes = [
  {
    path: '',
    title: 'Plateau · Table JDR',
    providers: [BoardState],
    loadComponent: () => import('./board-shell').then((m) => m.BoardShell),
  },
];
