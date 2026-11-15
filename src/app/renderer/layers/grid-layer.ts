import { Graphics } from 'pixi.js';

import type { GridConfig } from '../../core/models/game-state.model';
import type { RenderStyle } from '../render-style';

/** Lignes de la grille, d'épaisseur constante à l'écran. */
export class GridLayer {
  readonly view = new Graphics();

  private key = '';

  constructor(private readonly style: RenderStyle) {}

  update(grid: GridConfig, cellPx: number): void {
    const key = `${grid.cols}x${grid.rows}@${cellPx}`;
    if (key === this.key || cellPx <= 0) return;
    this.key = key;

    const g = this.view.clear();
    for (let x = 0; x <= grid.cols; x++) g.moveTo(x, 0).lineTo(x, grid.rows);
    for (let y = 0; y <= grid.rows; y++) g.moveTo(0, y).lineTo(grid.cols, y);

    // Le calque est à l'échelle des cases : on divise pour garder des pixels écran.
    g.stroke({
      width: this.style.gridWidthPx / cellPx,
      color: this.style.gridColor,
      alpha: this.style.gridAlpha,
    });
  }

  destroy(): void {
    this.view.destroy();
  }
}
