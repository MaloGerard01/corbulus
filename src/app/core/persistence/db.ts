import Dexie, { type EntityTable } from 'dexie';

import type { GameState } from '../models/game-state.model';

export interface SessionRecord {
  id: string;
  name: string;
  updatedAt: number;
  state: GameState;
}

/** Fichier importé (image de carte…), référencé par son `id` dans l'état. */
export interface AssetRecord {
  id: string;
  name: string;
  blob: Blob;
  /** Vignette pour la galerie (absente des fichiers importés avant son ajout). */
  thumbnail?: Blob;
  /** Dimensions de l'image, en pixels de l'image. */
  width: number;
  height: number;
  createdAt: number;
}

export class TableJdrDb extends Dexie {
  sessions!: EntityTable<SessionRecord, 'id'>;
  assets!: EntityTable<AssetRecord, 'id'>;

  constructor() {
    super('table-jdr');
    // Seuls les champs indexés sont déclarés ici, pas tout le schéma.
    this.version(1).stores({
      sessions: 'id, updatedAt',
    });
    this.version(2).stores({
      assets: 'id, createdAt',
    });
  }
}

export const db = new TableJdrDb();
