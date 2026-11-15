import { Injectable } from '@angular/core';

import {
  createInitialGameState,
  mapNameFromFile,
  type GameState,
} from '../models/game-state.model';
import { db, type SessionRecord } from './db';
import { restoreGameState, type SavedState } from './session-migration';

/** Longueur maximale d'un nom de session. */
export const SESSION_NAME_MAX_LENGTH = 80;

/** Ce que la liste des sessions affiche, sans l'état complet. */
export interface SessionSummary {
  id: string;
  name: string;
  updatedAt: number;
  mapCount: number;
  playerCount: number;
}

/** Une session ouverte : son nom et son état, remis au format actuel. */
export interface LoadedSession {
  id: string;
  name: string;
  state: GameState;
}

/** Sessions de jeu, chacune avec son état complet (cartes, brouillard, joueurs…). */
@Injectable({ providedIn: 'root' })
export class SessionRepository {
  /** Les sessions, de la plus récemment modifiée à la plus ancienne. */
  async list(): Promise<SessionSummary[]> {
    const records = await db.sessions.orderBy('updatedAt').reverse().toArray();
    return records.map(summarizeSession);
  }

  async create(name: string): Promise<string> {
    const id = crypto.randomUUID();
    await db.sessions.add({
      id,
      name: normalizeSessionName(name),
      updatedAt: Date.now(),
      state: createInitialGameState(),
    });
    return id;
  }

  /** Renomme sans toucher à la date de modification (qui reflète la partie). */
  async rename(id: string, name: string): Promise<void> {
    await db.sessions.update(id, { name: normalizeSessionName(name) });
  }

  async delete(id: string): Promise<void> {
    await db.sessions.delete(id);
  }

  /** `null` si la session n'existe pas (ou plus). */
  async load(id: string): Promise<LoadedSession | null> {
    const record = await db.sessions.get(id);
    if (!record) return null;

    // La sauvegarde peut dater d'une version précédente de l'app.
    const saved = record.state as SavedState;
    const legacyMapName =
      !saved.maps && saved.mapAssetId ? await this.assetName(saved.mapAssetId) : null;
    return { id, name: record.name, state: restoreGameState(saved, legacyMapName) };
  }

  /**
   * Enregistre l'état d'une session existante. Une session supprimée entre-temps
   * (depuis la liste, dans un autre onglet) n'est pas recréée.
   */
  async save(id: string, state: GameState): Promise<void> {
    await db.sessions.update(id, { state, updatedAt: Date.now() });
  }

  /** Images utilisées par au moins une session (pour nettoyer les autres). */
  async usedAssetIds(): Promise<string[]> {
    const records = await db.sessions.toArray();
    return records.flatMap((record) =>
      restoreGameState(record.state as SavedState, null).maps.map((m) => m.assetId),
    );
  }

  private async assetName(assetId: string): Promise<string | null> {
    const asset = await db.assets.get(assetId);
    return asset ? mapNameFromFile(asset.name) : null;
  }
}

/** Résumé affiché dans la liste ; accepte aussi les sauvegardes d'anciennes versions. */
export function summarizeSession(record: SessionRecord): SessionSummary {
  const state = restoreGameState(record.state as SavedState, null);
  return {
    id: record.id,
    name: record.name,
    updatedAt: record.updatedAt,
    mapCount: state.maps.length,
    playerCount: state.players.length,
  };
}

/** Nom nettoyé : espaces superflus retirés, longueur bornée, jamais vide. */
export function normalizeSessionName(name: string): string {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, SESSION_NAME_MAX_LENGTH);
  return clean || 'Session sans nom';
}
