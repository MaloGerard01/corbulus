import { Injectable } from '@angular/core';

import { db, type AssetRecord } from './db';

/** Nature d'un fichier importé. */
export type MediaKind = 'image' | 'gif' | 'video';

/** Métadonnées d'un fichier importé, sans son contenu. */
export type AssetInfo = Omit<AssetRecord, 'blob' | 'thumbnail' | 'kind'> & { kind: MediaKind };

/** De quoi afficher l'aperçu d'une image dans la galerie. */
export interface AssetPreview {
  thumbnail: Blob;
  /** Dimensions de l'image d'origine (pas de la vignette), en pixels de l'image. */
  width: number;
  height: number;
}

/** Plus grand côté des vignettes : nettes dans la galerie, même sur écran haute densité. */
const THUMBNAIL_MAX_PX = 480;

/** En deçà de cet âge, un fichier n'est jamais supprimé par le nettoyage. */
const RECENT_ASSET_MS = 60 * 60 * 1000;

/** Délai maximal pour lire les métadonnées d'une vidéo à l'import. */
const PROBE_TIMEOUT_MS = 15_000;

/** Extensions reconnues quand le système ne donne pas le type du fichier. */
const VIDEO_EXTENSIONS = /\.(mp4|m4v|webm|mov|ogv|mkv)$/i;

/** Ce qu'il faut savoir d'un fichier pour l'enregistrer. */
interface ProbedMedia {
  width: number;
  height: number;
  duration: number | null;
  /** Image représentative, pour la vignette. */
  frame: ImageBitmap;
}

/**
 * Fichiers importés (cartes…), stockés en Blob dans IndexedDB.
 * Seul leur identifiant circule dans l'état et vers le plateau : la vue MJ
 * et le plateau ont la même origine, donc lisent la même base.
 */
@Injectable({ providedIn: 'root' })
export class AssetRepository {
  /**
   * Enregistre une image, un GIF ou une vidéo, avec sa vignette. Le décodage
   * préalable vérifie que le fichier est lisible et donne ses dimensions.
   */
  async addMedia(file: Blob, name: string): Promise<AssetInfo> {
    const kind = mediaKind(file, name);
    const probed = kind === 'video' ? await probeVideo(file) : await probeImage(file);
    try {
      const info: AssetInfo = {
        id: crypto.randomUUID(),
        name,
        kind,
        width: probed.width,
        height: probed.height,
        duration: probed.duration,
        createdAt: Date.now(),
      };
      const thumbnail = await createThumbnail(probed.frame);
      await db.assets.add({ ...info, blob: file, thumbnail });
      return info;
    } finally {
      probed.frame.close();
    }
  }

  async getInfo(id: string): Promise<AssetInfo | null> {
    const record = await db.assets.get(id);
    if (!record) return null;
    const { blob: _blob, thumbnail: _thumbnail, ...info } = record;
    return { ...info, kind: record.kind ?? 'image' };
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

  /** Contenu du fichier, pour le lire tel quel (GIF, vidéo). `null` s'il n'existe plus. */
  async getBlob(id: string): Promise<Blob | null> {
    return (await db.assets.get(id))?.blob ?? null;
  }

  /** Image décodée, prête pour le renderer. `null` si l'asset n'existe plus. */
  async loadBitmap(id: string): Promise<ImageBitmap | null> {
    const record = await db.assets.get(id);
    return record ? createImageBitmap(record.blob) : null;
  }

  /**
   * Supprime ce qu'aucune session ne référence plus (carte retirée, session
   * supprimée…). `usedIds` doit couvrir **toutes** les sessions.
   *
   * Les fichiers importés depuis moins d'une heure sont gardés : une fenêtre
   * MJ peut les référencer sans avoir encore sauvegardé sa session.
   */
  async deleteUnused(usedIds: readonly string[]): Promise<number> {
    const used = new Set(usedIds);
    const cutoff = Date.now() - RECENT_ASSET_MS;
    // Seules les clés sont lues, pas les blobs.
    const old = await db.assets.where('createdAt').below(cutoff).primaryKeys();
    const unused = old.filter((id) => !used.has(id));
    await db.assets.bulkDelete(unused);
    return unused.length;
  }
}

/** Type du fichier, d'après son type MIME ou, à défaut, son extension. */
export function mediaKind(file: Blob, name: string): MediaKind {
  if (file.type === 'image/gif' || /\.gif$/i.test(name)) return 'gif';
  if (file.type.startsWith('video/') || VIDEO_EXTENSIONS.test(name)) return 'video';
  return 'image';
}

/** Image ou GIF : la première image donne les dimensions et la vignette. */
async function probeImage(file: Blob): Promise<ProbedMedia> {
  const frame = await createImageBitmap(file);
  return { width: frame.width, height: frame.height, duration: null, frame };
}

/**
 * Vidéo : dimensions et durée lues dans ses métadonnées ; la vignette est
 * prise un peu après le début (la toute première image est souvent noire).
 */
async function probeVideo(file: Blob): Promise<ProbedMedia> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'auto';
  try {
    const loaded = nextEvent(video, 'loadeddata');
    video.src = url;
    await loaded;

    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const seeked = nextEvent(video, 'seeked');
    video.currentTime = duration ? Math.min(1, duration / 10) : 0.1;
    await seeked;

    const frame = await createImageBitmap(video);
    return { width: video.videoWidth, height: video.videoHeight, duration, frame };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Attend un événement de la vidéo ; échoue si elle ne peut pas être lue, ou
 * si le navigateur ne répond pas (format qu'il ne sait pas décoder…).
 */
function nextEvent(video: HTMLVideoElement, type: 'loadeddata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vidéo illisible (délai dépassé)')), PROBE_TIMEOUT_MS);
    video.addEventListener(
      type,
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
    video.addEventListener(
      'error',
      () => {
        clearTimeout(timeout);
        reject(video.error ?? new Error('Vidéo illisible'));
      },
      { once: true },
    );
  });
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
