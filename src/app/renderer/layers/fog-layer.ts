import { Container, Graphics, RenderTexture, Sprite, type Renderer } from 'pixi.js';

import type { FogOp, FogState, GridConfig } from '../../core/models/game-state.model';
import { firstNewFogOp, fogOpKey } from '../fog-ops';
import type { RenderStyle } from '../render-style';
import { traceShape } from '../shapes';

/**
 * Brouillard de guerre : les opérations sont dessinées dans l'ordre dans une
 * texture, en partant d'un calque entièrement noir. `reveal` efface (mode
 * `erase`), `hide` repeint en noir.
 *
 * Quand le MJ ajoute une opération, seule celle-ci est dessinée par-dessus la
 * texture existante ; une annulation redessine tout.
 */
export class FogLayer {
  readonly view = new Sprite();

  private texture: RenderTexture | null = null;
  private textureKey = '';
  /** Opérations déjà présentes dans la texture. */
  private drawnKeys: string[] = [];
  /** Texture neuve (vide, pas même le fond noir) : il faut tout redessiner. */
  private stale = true;
  private cols = 0;
  private rows = 0;
  private cellPx = 0;

  constructor(
    private readonly renderer: Renderer,
    style: RenderStyle,
  ) {
    this.view.alpha = style.fogAlpha;
  }

  update(fog: FogState, grid: GridConfig, cellPx: number): void {
    this.view.visible = fog.enabled;
    // Désactivé : on ne dessine rien, la texture sera remise à jour à la réactivation.
    if (!fog.enabled || cellPx <= 0) return;

    this.ensureTexture(grid, cellPx);

    const keys = fog.ops.map(fogOpKey);
    const from = this.stale ? null : firstNewFogOp(this.drawnKeys, keys);
    if (from === null) {
      this.draw(fog.ops, 0, true);
    } else if (from < keys.length) {
      this.draw(fog.ops, from, false);
    }
    this.drawnKeys = keys;
    this.stale = false;
  }

  destroy(): void {
    this.view.destroy();
    this.texture?.destroy(true);
  }

  /** Une texture à la résolution de l'écran, recréée si la grille ou la taille des cases change. */
  private ensureTexture(grid: GridConfig, cellPx: number): void {
    const key = `${grid.cols}x${grid.rows}@${cellPx}`;
    if (key === this.textureKey) return;
    this.textureKey = key;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellPx = cellPx;

    this.texture?.destroy(true);
    this.texture = RenderTexture.create({
      width: Math.ceil(grid.cols * cellPx),
      height: Math.ceil(grid.rows * cellPx),
      resolution: this.renderer.resolution,
      antialias: true,
    });
    this.view.texture = this.texture;
    // La texture est en pixels, le calque en cases.
    this.view.scale.set(1 / cellPx);
    this.stale = true;
  }

  private draw(ops: readonly FogOp[], from: number, fromScratch: boolean): void {
    if (!this.texture) return;

    const batch = new Container();
    batch.scale.set(this.cellPx);

    if (fromScratch) {
      batch.addChild(new Graphics().rect(0, 0, this.cols, this.rows).fill(0x000000));
    }
    for (const op of ops.slice(from)) {
      const g = traceShape(new Graphics(), op.shape).fill(0x000000);
      if (op.mode === 'reveal') g.blendMode = 'erase';
      batch.addChild(g);
    }

    this.renderer.render({ container: batch, target: this.texture, clear: fromScratch });
    batch.destroy({ children: true });
  }
}
