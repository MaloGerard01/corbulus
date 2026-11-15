import { Graphics } from 'pixi.js';

import type { GridConfig } from '../../core/models/game-state.model';
import type { CellRect } from '../layout';
import type { RenderStyle } from '../render-style';

/** Tolérance pour savoir si le cadre couvre toute la grille. */
const EPSILON = 1e-6;

/**
 * Aperçu MJ : encadre la zone visible sur la TV et assombrit le hors-champ.
 */
export class FrameLayer {
  readonly view = new Graphics();

  private key = '';

  constructor(private readonly style: RenderStyle) {}

  update(frame: CellRect | null, grid: GridConfig, cellPx: number): void {
    const key = frame
      ? `${frame.x},${frame.y},${frame.w},${frame.h}|${grid.cols}x${grid.rows}@${cellPx}`
      : '';
    if (key === this.key) return;
    this.key = key;

    const g = this.view.clear();
    if (!frame || cellPx <= 0) return;

    const coversGrid = frame.w >= grid.cols - EPSILON && frame.h >= grid.rows - EPSILON;
    if (!coversGrid) {
      g.rect(0, 0, grid.cols, grid.rows).fill({ color: 0x000000, alpha: 0.45 });
      g.rect(frame.x, frame.y, frame.w, frame.h).cut();
    }
    g.rect(frame.x, frame.y, frame.w, frame.h).stroke({
      width: this.style.frameWidthPx / cellPx,
      color: this.style.frameColor,
    });
  }

  destroy(): void {
    this.view.destroy();
  }
}
