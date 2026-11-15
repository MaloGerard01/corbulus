import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Sessions · Table JDR',
    loadComponent: () => import('./features/sessions/sessions-page').then((m) => m.SessionsPage),
  },
  {
    path: 'dm/:sessionId',
    loadChildren: () => import('./features/dm/dm.routes').then((m) => m.DM_ROUTES),
  },
  {
    path: 'board',
    loadChildren: () => import('./features/board/board.routes').then((m) => m.BOARD_ROUTES),
  },
  // Dont l'ancienne adresse /dm, sans session : retour à la liste.
  { path: '**', redirectTo: '' },
];
