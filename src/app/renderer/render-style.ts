import type { Fit } from './layout';

/**
 * `board` : la TV sous le plexiglas, brouillard opaque.
 * `dm` : l'aperçu du MJ, brouillard semi-transparent pour voir ce qu'il cache.
 */
export type RenderMode = 'board' | 'dm';

export interface RenderStyle {
  /** La TV est couverte entièrement ; l'aperçu MJ montre toute la grille. */
  fit: Fit;
  background: string;
  backgroundAlpha: number;
  /** Fond de la grille tant qu'aucune carte n'est chargée. */
  mapPlaceholder: string;
  gridColor: string;
  gridAlpha: number;
  /** Épaisseur des lignes en pixels écran, quelle que soit la taille des cases. */
  gridWidthPx: number;
  fogAlpha: number;
  /** Cadre de la zone visible sur la TV (aperçu MJ). */
  frameColor: string;
  frameWidthPx: number;
}

export const RENDER_STYLES: Record<RenderMode, RenderStyle> = {
  // Couleurs franches et lignes épaisses : le plexiglas crée des reflets.
  board: {
    fit: 'cover',
    background: '#000000',
    backgroundAlpha: 1,
    mapPlaceholder: '#2a2a33',
    gridColor: '#ffffff',
    gridAlpha: 0.35,
    gridWidthPx: 2,
    fogAlpha: 1,
    frameColor: '#7c6cf0',
    frameWidthPx: 3,
  },
  // Fond transparent : l'aperçu se fond dans le panneau de la vue MJ.
  dm: {
    fit: 'contain',
    background: '#000000',
    backgroundAlpha: 0,
    mapPlaceholder: '#2a2a33',
    gridColor: '#ffffff',
    gridAlpha: 0.2,
    gridWidthPx: 1,
    fogAlpha: 0.6,
    frameColor: '#7c6cf0',
    frameWidthPx: 3,
  },
};
