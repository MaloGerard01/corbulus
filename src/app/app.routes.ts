import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dm' },
  {
    path: 'dm',
    loadChildren: () => import('./features/dm/dm.routes').then((m) => m.DM_ROUTES),
  },
  {
    path: 'board',
    loadChildren: () => import('./features/board/board.routes').then((m) => m.BOARD_ROUTES),
  },
  { path: '**', redirectTo: 'dm' },
];
