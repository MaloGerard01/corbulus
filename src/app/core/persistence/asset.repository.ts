import { Injectable } from '@angular/core';

import { db, type AssetRecord } from './db';

/** Métadonnées d'un fichier importé, sans son contenu. */
export type AssetInfo = Omit<AssetRecord, 'blob'>;

/**
 * Fichiers importés (cartes…), stockés en Blob dans IndexedDB.
 * Seul leur identifiant circule dans l'état et vers le plateau : la vue MJ
 * et le plateau ont la même origine, donc lisent la même base.
 */
@Injectable({ providedIn: 'root' })
export class AssetRepository {
  /**
   * Enregistre une image. Le décodage préalable vérifie que le fichier est
   * bien une image lisible et donne ses dimensions.
   */
  async addImage(file: Blob, name: string): Promise<AssetInfo> {
    const bitmap = await createImageBitmap(file);
    const info: AssetInfo = {
      id: crypto.randomUUID(),
      name,
      width: bitmap.width,
      height: bitmap.height,
      createdAt: Date.now(),
    };
    bitmap.close();

    await db.assets.add({ ...info, blob: file });
    return info;
  }

  async getInfo(id: string): Promise<AssetInfo | null> {
    const record = await db.assets.get(id);
    if (!record) return null;
    const { blob: _, ...info } = record;
    return info;
  }

  /** Image décodée, prête pour le renderer. `null` si l'asset n'existe plus. */
  async loadBitmap(id: string): Promise<ImageBitmap | null> {
    const record = await db.assets.get(id);
    return record ? createImageBitmap(record.blob) : null;
  }

  /** Supprime tout ce qui n'est plus référencé (carte remplacée, session effacée…). */
  async deleteUnused(usedIds: readonly string[]): Promise<number> {
    const used = new Set(usedIds);
    // Seules les clés sont lues, pas les blobs.
    const unused = (await db.assets.toCollection().primaryKeys()).filter((id) => !used.has(id));
    await db.assets.bulkDelete(unused);
    return unused.length;
  }
}
