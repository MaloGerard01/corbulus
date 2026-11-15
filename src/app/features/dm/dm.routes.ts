import { inject, provideEnvironmentInitializer } from '@angular/core';
import type { Routes } from '@angular/router';

import { DmSyncEffects } from './state/dm-sync.effects';
import { GameStore } from './state/game.store';

export const DM_ROUTES: Routes = [
  {
    path: '',
    title: 'MJ · Table JDR',
    // Ces providers n'existent que sous /dm : le plateau ne peut pas
    // injecter le GameStore (et donc lire l'état complet) par erreur.
    providers: [
      GameStore,
      DmSyncEffects,
      provideEnvironmentInitializer(() => inject(DmSyncEffects)),
    ],
    loadComponent: () => import('./dm-shell').then((m) => m.DmShell),
  },
];
