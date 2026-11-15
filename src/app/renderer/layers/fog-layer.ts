import {
  Container,
  Graphics,
  RenderTexture,
  RendererType,
  Sprite,
  Texture,
  TilingSprite,
  type Renderer,
  type WebGLRenderer,
} from 'pixi.js';

import type {
  FogBrushOp,
  FogFillOp,
  FogOp,
  FogState,
  FogStyle,
  GridConfig,
} from '../../core/models/game-state.model';
import { brushDiameter, brushStamps, planFogUpdate, type FogPlan } from '../fog-ops';
import { CLOUD_LIGHT, brushPixels, cloudPixels } from '../fog-textures';
import type { RenderStyle } from '../render-style';

/**
 * Côté maximal des textures, en pixels physiques. Le brouillard a des bords
 * flous : plus de résolution ne se verrait pas, et coûterait en mémoire.
 */
const MAX_TEXTURE_PX = 2048;
const BRUSH_TEXTURE_PX = 128;
const CLOUD_TEXTURE_PX = 256;
/** Un motif de nuages couvre ce nombre de cases : même grain sur la TV et dans l'aperçu. */
const CLOUD_TILE_CELLS = 16;
/** Précision du rapport cœur / fondu des empreintes : une texture par 1/32. */
const CORE_STEPS = 32;

const cloudGray = Math.round(CLOUD_LIGHT * 255);

/** Couleur peinte pour chaque style ; le gris du brouillard de guerre est ensuite nuancé de nuages. */
const STYLE_COLORS: Record<FogStyle, number> = {
  darkness: 0x000000,
  fog: (cloudGray << 16) | (cloudGray << 8) | cloudGray,
};

/**
 * Brouillard peint au pinceau sur une carte d'abord visible.
 *
 * - `stroke` : couverture du dernier tracé, ses empreintes combinées par
 *   **maximum** (et non cumulées) : le bord du tracé a exactement le profil
 *   du pinceau, cœur plein puis fondu sur la largeur choisie.
 * - `paint` : les opérations précédentes, déjà fixées. Quand un nouveau tracé
 *   commence, le précédent y est fixé, teinté de son style (ou en effacement).
 *   Un style peint par-dessus un autre le remplace en fondu.
 * - `display` = `paint` + `stroke` + nuages du brouillard de guerre,
 *   recomposé à chaque changement (et non à chaque image).
 *
 * Quand le MJ peint, seules les nouvelles empreintes sont dessinées ; une
 * annulation redessine tout.
 */
export class FogLayer {
  readonly view = new Sprite();

  private paint: RenderTexture | null = null;
  private stroke: RenderTexture | null = null;
  private display: RenderTexture | null = null;

  /**
   * Pixi n'applique pas le mode de fusion de l'objet passé à `render()`
   * (seulement celui de ses enfants) : chaque sprite qui en a un est donc
   * l'enfant d'un conteneur, d'où ces paires conteneur / sprite.
   */
  private readonly composition = new Container();
  private readonly paintSprite = new Sprite();
  private readonly strokeSprite = new Sprite();
  private readonly commitLayer = new Container();
  private readonly commitSprite = new Sprite();
  private readonly empty = new Container();

  /** Nuages du brouillard de guerre ; `null` sans modes de fusion `min`/`max`. */
  private readonly noise: TilingSprite | null;
  /** Empreintes combinées par maximum (sinon cumulées : bords plus raides). */
  private readonly stampBlend: 'max' | 'normal';
  /** Textures d'empreinte, une par rapport cœur / fondu, créées au besoin. */
  private readonly brushes = new Map<number, Texture>();

  /** Tracé dont la couverture est dans `stroke` (pas encore fixé dans `paint`). */
  private strokeOp: FogBrushOp | null = null;
  private textureKey = '';
  /** Opérations déjà prises en compte (dans `paint` ou `stroke`). */
  private drawnOps: readonly FogOp[] = [];
  /** Textures neuves (vides) : il faut tout redessiner. */
  private stale = true;
  private cols = 0;
  private rows = 0;
  /** Taille d'une case dans les textures : palier proche de la taille à l'écran. */
  private cellPx = 0;

  constructor(
    private readonly renderer: Renderer,
    style: RenderStyle,
  ) {
    this.view.alpha = style.fogAlpha;
    this.commitLayer.addChild(this.commitSprite);
    this.composition.addChild(this.paintSprite, this.strokeSprite);

    if (supportsMinMaxBlend(renderer)) {
      this.stampBlend = 'max';
      const clouds = textureFromPixels(cloudPixels(CLOUD_TEXTURE_PX), CLOUD_TEXTURE_PX);
      this.noise = new TilingSprite({ texture: clouds });
      // min(nuages, peinture) : les nuages ne nuancent que le gris, l'alpha est conservé.
      this.noise.blendMode = 'min';
      this.composition.addChild(this.noise);
    } else {
      this.stampBlend = 'normal';
      this.noise = null;
    }
  }

  update(fog: FogState, grid: GridConfig, cellPx: number): void {
    this.view.visible = fog.enabled;
    // Masqué : rien n'est dessiné, les textures seront mises à jour au retour.
    if (!fog.enabled || cellPx <= 0) return;

    this.ensureTextures(grid, cellPx);

    const plan: FogPlan = this.stale ? { kind: 'full' } : planFogUpdate(this.drawnOps, fog.ops);
    this.drawnOps = fog.ops;
    this.stale = false;
    if (plan.kind === 'none') return;

    if (plan.kind === 'full') {
      this.clear(this.paint);
      this.clear(this.stroke);
      this.strokeOp = null;
      this.apply(fog.ops, 0, 0);
    } else {
      this.apply(fog.ops, plan.op, plan.point);
    }
    this.compose();
  }

  destroy(): void {
    this.view.destroy();
    this.noise?.destroy({ texture: true, textureSource: true });
    this.composition.destroy({ children: true });
    this.commitLayer.destroy({ children: true });
    this.empty.destroy();
    this.brushes.forEach((brush) => brush.destroy(true));
    this.brushes.clear();
    this.paint?.destroy(true);
    this.stroke?.destroy(true);
    this.display?.destroy(true);
  }

  /** Textures recréées si la grille change ou si la taille des cases franchit un palier. */
  private ensureTextures(grid: GridConfig, cellPx: number): void {
    // Paliers ×√2 : zoomer ou redimensionner (qui changent cellPx à chaque
    // mouvement de souris) ne recrée les textures qu'au passage d'un palier.
    const stepped = 2 ** (Math.ceil(Math.log2(cellPx) * 2) / 2);
    const maxCssPx = MAX_TEXTURE_PX / this.renderer.resolution;
    const textureCellPx = Math.min(stepped, maxCssPx / grid.cols, maxCssPx / grid.rows);

    const key = `${grid.cols}x${grid.rows}@${textureCellPx}`;
    if (key === this.textureKey) return;
    this.textureKey = key;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cellPx = textureCellPx;

    const options = {
      width: Math.ceil(grid.cols * textureCellPx),
      height: Math.ceil(grid.rows * textureCellPx),
      resolution: this.renderer.resolution,
    };
    const previous = [this.paint, this.stroke, this.display];
    this.paint = RenderTexture.create(options);
    this.stroke = RenderTexture.create(options);
    this.display = RenderTexture.create(options);
    this.paintSprite.texture = this.paint;
    this.strokeSprite.texture = this.stroke;
    this.commitSprite.texture = this.stroke;
    this.view.texture = this.display;
    previous.forEach((texture) => texture?.destroy(true));

    // Les textures sont en pixels, le calque en cases.
    this.view.scale.set(1 / textureCellPx);
    if (this.noise) {
      this.noise.setSize(options.width, options.height);
      this.noise.tileScale.set((CLOUD_TILE_CELLS * textureCellPx) / CLOUD_TEXTURE_PX);
    }
    this.strokeOp = null;
    this.stale = true;
  }

  /** Applique `ops[fromOp…]`, la première à partir de son point `fromPoint`. */
  private apply(ops: readonly FogOp[], fromOp: number, fromPoint: number): void {
    for (let i = fromOp; i < ops.length; i++) {
      const op = ops[i];
      const from = i === fromOp ? fromPoint : 0;

      // Le tracé en cours s'allonge : sa couverture est encore à part.
      if (from > 0 && op.kind === 'brush' && op.id === this.strokeOp?.id) {
        this.stamp(op, from);
        this.strokeOp = op;
        continue;
      }

      // Toute autre opération termine le tracé précédent.
      this.commitStroke();
      if (op.kind === 'fill') {
        this.fill(op);
      } else {
        this.stamp(op, 0);
        this.strokeOp = op;
      }
    }
  }

  /** Ajoute les empreintes d'un tracé à `stroke`, combinées par maximum. */
  private stamp(op: FogBrushOp, fromPoint: number): void {
    if (!this.stroke) return;

    const batch = new Container();
    batch.scale.set(this.cellPx);
    const texture = this.brushTexture(op);
    const diameter = brushDiameter(op);
    for (const [x, y] of brushStamps(op, fromPoint)) {
      const stamp = new Sprite(texture);
      stamp.anchor.set(0.5);
      stamp.position.set(x, y);
      stamp.setSize(diameter, diameter);
      stamp.blendMode = this.stampBlend;
      batch.addChild(stamp);
    }

    this.renderer.render({ container: batch, target: this.stroke, clear: fromPoint === 0 });
    // Les empreintes partagent les textures du pinceau : elles ne sont pas détruites.
    batch.destroy({ children: true });
  }

  /** Fixe le tracé en cours dans `paint`, teinté de son style, puis vide `stroke`. */
  private commitStroke(): void {
    if (!this.strokeOp || !this.paint) return;
    styleStroke(this.commitSprite, this.strokeOp);
    this.renderer.render({ container: this.commitLayer, target: this.paint, clear: false });
    this.clear(this.stroke);
    this.strokeOp = null;
  }

  private fill(op: FogFillOp): void {
    if (!this.paint) return;
    const layer = new Container();
    const fill = new Graphics()
      .rect(0, 0, this.cols * this.cellPx, this.rows * this.cellPx)
      .fill(STYLE_COLORS[op.style]);
    if (op.mode === 'reveal') fill.blendMode = 'erase';
    layer.addChild(fill);
    this.renderer.render({ container: layer, target: this.paint, clear: false });
    layer.destroy({ children: true });
  }

  /** Texture d'empreinte pour la part du rayon occupée par le cœur (arrondie). */
  private brushTexture(op: FogBrushOp): Texture {
    const core = Math.round((op.size / brushDiameter(op)) * CORE_STEPS) / CORE_STEPS;
    let brush = this.brushes.get(core);
    if (!brush) {
      brush = textureFromPixels(brushPixels(BRUSH_TEXTURE_PX, core), BRUSH_TEXTURE_PX);
      this.brushes.set(core, brush);
    }
    return brush;
  }

  /** `display` = opérations fixées + tracé en cours + nuages (mode `min`), en une passe. */
  private compose(): void {
    if (!this.display) return;
    this.strokeSprite.visible = this.strokeOp !== null;
    if (this.strokeOp) styleStroke(this.strokeSprite, this.strokeOp);
    this.renderer.render({ container: this.composition, target: this.display, clear: true });
  }

  private clear(target: RenderTexture | null): void {
    if (target) this.renderer.render({ container: this.empty, target, clear: true });
  }
}

/** Couverture d'un tracé (blanc) → noir ou gris selon son style, ou effacement. */
function styleStroke(sprite: Sprite, op: FogBrushOp): void {
  if (op.mode === 'reveal') {
    sprite.blendMode = 'erase';
    sprite.tint = 0xffffff;
  } else {
    sprite.blendMode = 'normal';
    sprite.tint = STYLE_COLORS[op.style];
  }
}

/** Les modes `min` et `max` sont natifs en WebGL 2, et une extension très répandue en WebGL 1. */
function supportsMinMaxBlend(renderer: Renderer): boolean {
  if (renderer.type !== RendererType.WEBGL) return false;
  const webgl = renderer as WebGLRenderer;
  return webgl.context.webGLVersion === 2 || webgl.gl.getExtension('EXT_blend_minmax') !== null;
}

function textureFromPixels(pixels: Uint8ClampedArray<ArrayBuffer>, size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, size, size), 0, 0);
  // skipCache : texture propre au calque, détruite avec lui.
  return Texture.from(canvas, true);
}
