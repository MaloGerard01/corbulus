import { Injectable } from '@angular/core';

import { centeredCamera, createInitialGameState, type GameState } from '../models/game-state.model';
import { db } from './db';

const CURRENT_SESSION_ID = 'current';

@Injectable({ providedIn: 'root' })
export class SessionRepository {
  async loadCurrent(): Promise<GameState | null> {
    const record = await db.sessions.get(CURRENT_SESSION_ID);
    if (!record) return null;

    // Fusion avec l'état initial : une sauvegarde faite avant l'ajout
    // d'un nouveau champ dans GameState (ou dans un sous-objet) reste chargeable.
    const initial = createInitialGameState();
    const grid = { ...initial.grid, ...record.state.grid };
    return {
      ...initial,
      ...record.state,
      grid,
      // Caméra absente (ou sans zoom) dans les sauvegardes antérieures.
      camera: { ...centeredCamera(grid), ...record.state.camera },
    };
  }

  async saveCurrent(state: GameState): Promise<void> {
    await db.sessions.put({
      id: CURRENT_SESSION_ID,
      name: 'Session en cours',
      updatedAt: Date.now(),
      state,
    });
  }
}
