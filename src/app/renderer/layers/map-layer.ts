import { Container, Graphics, Sprite, Texture } from 'pixi.js';

import type { GridConfig } from '../../core/models/game-state.model';
import type { RenderStyle } from '../render-style';

export type MapImageSource = ImageBitmap | HTMLImageElement | HTMLCanvasElement;

/**
 * Image de la carte, découpée aux limites de la grille pour que rien ne
 * dépasse du brouillard. Sans image, un fond uni matérialise la grille.
 */
export class MapLayer {
  readonly view = new Container();

  private readonly placeholder = new Graphics();
  private readonly clip = new Graphics();
  private sprite: Sprite | null = null;
  private image: MapImageSource | null = null;
  private key = '';

  constructor(private readonly style: RenderStyle) {
    this.view.addChild(this.placeholder, this.clip);
    this.view.mask = this.clip;
  }

  /**
   * Le calque prend possession de l'image : un `ImageBitmap` est fermé
   * (mémoire libérée) quand la carte est remplacée ou le calque détruit.
   */
  setImage(source: MapImageSource | null): void {
    this.releaseImage();
    if (source) {
      this.image = source;
      // skipCache : chaque carte a sa propre texture, détruite quand on en change.
      this.sprite = new Sprite(Texture.from(source, true));
      this.view.addChildAt(this.sprite, 1);
    }
    this.key = '';
  }

  update(grid: GridConfig): void {
    const key = `${grid.cols}x${grid.rows}+${grid.offsetX},${grid.offsetY}@${grid.mapCellPx}`;
    if (key === this.key) return;
    this.key = key;

    this.placeholder.clear().rect(0, 0, grid.cols, grid.rows).fill(this.style.mapPlaceholder);
    this.clip.clear().rect(0, 0, grid.cols, grid.rows).fill(0xffffff);

    if (this.sprite) {
      // La case (0, 0) de la grille tombe à (offsetX, offsetY) cases dans l'image.
      const { width, height } = this.sprite.texture;
      this.sprite.position.set(-grid.offsetX, -grid.offsetY);
      this.sprite.setSize(width / grid.mapCellPx, height / grid.mapCellPx);
    }
  }

  destroy(): void {
    this.releaseImage();
    this.view.destroy({ children: true });
  }

  private releaseImage(): void {
    this.sprite?.destroy({ texture: true, textureSource: true });
    this.sprite = null;
    if (typeof ImageBitmap !== 'undefined' && this.image instanceof ImageBitmap) {
      this.image.close();
    }
    this.image = null;
  }
}
