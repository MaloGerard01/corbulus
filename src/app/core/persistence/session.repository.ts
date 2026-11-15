import { Injectable } from '@angular/core';

import { mapNameFromFile, type GameState } from '../models/game-state.model';
import { db } from './db';
import { restoreGameState, type SavedState } from './session-migration';

const CURRENT_SESSION_ID = 'current';

@Injectable({ providedIn: 'root' })
export class SessionRepository {
  async loadCurrent(): Promise<GameState | null> {
    const record = await db.sessions.get(CURRENT_SESSION_ID);
    if (!record) return null;

    // La sauvegarde peut dater d'une version précédente de l'app.
    const saved = record.state as SavedState;
    const legacyMapName =
      !saved.maps && saved.mapAssetId ? await this.assetName(saved.mapAssetId) : null;
    return restoreGameState(saved, legacyMapName);
  }

  async saveCurrent(state: GameState): Promise<void> {
    await db.sessions.put({
      id: CURRENT_SESSION_ID,
      name: 'Session en cours',
      updatedAt: Date.now(),
      state,
    });
  }

  private async assetName(assetId: string): Promise<string | null> {
    const asset = await db.assets.get(assetId);
    return asset ? mapNameFromFile(asset.name) : null;
  }
}
