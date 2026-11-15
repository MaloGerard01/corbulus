import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  provideRouter,
  withAutoCleanupInjectors,
  withComponentInputBinding,
} from '@angular/router';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Paramètres de route (:sessionId) passés en input aux composants.
      withComponentInputBinding(),
      // Quitter une route détruit les services qu'elle fournit (GameStore…) :
      // sans cela, ils survivraient et la session suivante hériterait de l'état.
      withAutoCleanupInjectors(),
    ),
  ],
};
