import { Injectable } from '@angular/core';

import { db, type AssetRecord } from './db';

/** Métadonnées d'un fichier importé, sans son contenu. */
export type AssetInfo = Omit<AssetRecord, 'blob' | 'thumbnail'>;

/** De quoi afficher l'aperçu d'une image dans la galerie. */
export interface AssetPreview {
  thumbnail: Blob;
  /** Dimensions de l'image d'origine (pas de la vignette), en pixels de l'image. */
  width: number;
  height: number;
}

/** Plus grand côté des vignettes : nettes dans la galerie, même sur écran haute densité. */
const THUMBNAIL_MAX_PX = 480;

/**
 * Fichiers importés (cartes…), stockés en Blob dans IndexedDB.
 * Seul leur identifiant circule dans l'état et vers le plateau : la vue MJ
 * et le plateau ont la même origine, donc lisent la même base.
 */
@Injectable({ providedIn: 'root' })
export class AssetRepository {
  /**
   * Enregistre une image avec sa vignette. Le décodage préalable vérifie que
   * le fichier est bien une image lisible et donne ses dimensions.
   */
  async addImage(file: Blob, name: string): Promise<AssetInfo> {
    const bitmap = await createImageBitmap(file);
    try {
      const info: AssetInfo = {
        id: crypto.randomUUID(),
        name,
        width: bitmap.width,
        height: bitmap.height,
        createdAt: Date.now(),
      };
      const thumbnail = await createThumbnail(bitmap);
      await db.assets.add({ ...info, blob: file, thumbnail });
      return info;
    } finally {
      bitmap.close();
    }
  }

  async getInfo(id: string): Promise<AssetInfo | null> {
    const record = await db.assets.get(id);
    if (!record) return null;
    const { blob: _blob, thumbnail: _thumbnail, ...info } = record;
    return info;
  }

  /** Vignette (l'image entière pour les anciens fichiers) et dimensions de l'image. */
  async getPreview(id: string): Promise<AssetPreview | null> {
    const record = await db.assets.get(id);
    if (!record) return null;
    return {
      thumbnail: record.thumbnail ?? record.blob,
      width: record.width,
      height: record.height,
    };
  }

  /** Image décodée, prête pour le renderer. `null` si l'asset n'existe plus. */
  async loadBitmap(id: string): Promise<ImageBitmap | null> {
    const record = await db.assets.get(id);
    return record ? createImageBitmap(record.blob) : null;
  }

  /** Supprime tout ce qui n'est plus référencé (carte retirée, session effacée…). */
  async deleteUnused(usedIds: readonly string[]): Promise<number> {
    const used = new Set(usedIds);
    // Seules les clés sont lues, pas les blobs.
    const unused = (await db.assets.toCollection().primaryKeys()).filter((id) => !used.has(id));
    await db.assets.bulkDelete(unused);
    return unused.length;
  }
}

/** Réduit l'image : la galerie n'a pas à décoder des cartes de plusieurs Mo. */
async function createThumbnail(image: ImageBitmap): Promise<Blob> {
  const scale = Math.min(1, THUMBNAIL_MAX_PX / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D indisponible pour la vignette');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, width, height);
  return canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
}
