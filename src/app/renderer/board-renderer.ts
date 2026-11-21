import { Application, Container } from 'pixi.js';

import type { BoardView } from '../core/models/board-view.model';
import type { Camera } from '../core/models/game-state.model';
import type { BoardEvent } from '../core/models/sync-message.model';
import { focusCamera, type CameraFocus } from './camera-focus';
import { EffectsLayer } from './layers/effects-layer';
import { FogLayer } from './layers/fog-layer';
import { FrameLayer } from './layers/frame-layer';
import { GridLayer } from './layers/grid-layer';
import { MapLayer, type MapImageSource } from './layers/map-layer';
import { computeLayout, type CellRect } from './layout';
import { RENDER_STYLES, type RenderMode, type RenderStyle } from './render-style';

interface Layers {
  map: MapLayer;
  grid: GridLayer;
  fog: FogLayer;
  effects: EffectsLayer;
  frame: FrameLayer;
}

/**
 * Rendu du plateau avec PixiJS, en TypeScript pur (aucune dépendance Angular).
 *
 * Le calque `world` est à l'échelle des cases : tout ce qu'il contient est
 * exprimé en unités de grille, la conversion en pixels se fait uniquement ici
 * (voir `computeLayout`).
 *
 * Cycle de vie : `init()` est asynchrone (Pixi 8) ; `render()` et
 * `playEffect()` sont sans effet tant qu'elle n'est pas terminée.
 *
 * Un focus (effet du MJ) déplace temporairement la caméra : elle est alors
 * animée image par image, puis revient à celle de la vue.
 */
export class BoardRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private layers: Layers | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private view: BoardView | null = null;
  private frame: CellRect | null = null;
  /** Focus en cours (TV seulement). */
  private focus: CameraFocus | null = null;
  /** Caméra affichée à la dernière image : point de départ d'un nouveau focus. */
  private shownCamera: Camera | null = null;
  private destroyed = false;
  private readonly style: RenderStyle;

  constructor(mode: RenderMode) {
    this.style = RENDER_STYLES[mode];
  }

  get ready(): boolean {
    return this.layers !== null;
  }

  /**
   * Crée le canvas dans `host`, qui doit être positionné (relative, absolute…)
   * et dimensionné par son parent : le canvas en prend toute la place.
   */
  async init(host: HTMLElement): Promise<void> {
    const style = this.style;

    await this.app.init({
      width: Math.max(1, host.clientWidth),
      height: Math.max(1, host.clientHeight),
      background: style.background,
      backgroundAlpha: style.backgroundAlpha,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      preference: 'webgl',
    });

    // destroy() appelé pendant l'init (route quittée très vite)
    if (this.destroyed) {
      this.app.destroy(true, { children: true, texture: true, textureSource: true });
      return;
    }

    Object.assign(this.app.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      display: 'block',
    });
    host.appendChild(this.app.canvas);

    const layers: Layers = {
      map: new MapLayer(style),
      grid: new GridLayer(style),
      fog: new FogLayer(this.app.renderer, style),
      effects: new EffectsLayer(this.app.ticker, this.world),
      frame: new FrameLayer(style),
    };
    // Ordre d'empilement : carte, grille, brouillard, effets, cadre de la TV.
    this.world.addChild(
      layers.map.view,
      layers.grid.view,
      layers.fog.view,
      layers.effects.view,
      layers.frame.view,
    );
    this.app.stage.addChild(this.world);
    this.layers = layers;
    this.app.ticker.add(this.tick);

    this.resizeObserver = new ResizeObserver(() => {
      this.resize(host.clientWidth, host.clientHeight);
    });
    this.resizeObserver.observe(host);

    this.draw();
  }

  render(view: BoardView): void {
    // Changer de carte interrompt le focus : sa cible n'a plus de sens.
    if (this.view && view.mapAssetId !== this.view.mapAssetId) this.focus = null;
    this.view = view;
    this.draw();
  }

  /**
   * L'image est fournie déjà décodée : le renderer ne sait rien du stockage.
   * Il en prend possession (un `ImageBitmap` sera fermé au remplacement).
   */
  setMapImage(source: MapImageSource | null): void {
    this.layers?.map.setImage(source);
    this.draw();
  }

  playEffect(event: BoardEvent): void {
    if (!this.layers) return;
    if (event.kind === 'focus') {
      this.startFocus(event.camera, event.durationMs);
    } else {
      this.layers.effects.play(event);
    }
  }

  /** Zone visible sur la TV, encadrée dans l'aperçu du MJ (`null` : pas de cadre). */
  setFrame(frame: CellRect | null): void {
    this.frame = frame;
    this.draw();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();

    // Si l'init est en cours, c'est elle qui détruira l'application à la fin.
    if (!this.layers) return;

    const { map, grid, fog, effects, frame } = this.layers;
    this.layers = null;
    this.focus = null;
    this.app.ticker.remove(this.tick);
    frame.destroy();
    effects.destroy();
    fog.destroy();
    grid.destroy();
    map.destroy();
    this.app.destroy(true, { children: true });
  }

  private resize(width: number, height: number): void {
    if (!this.layers || width <= 0 || height <= 0) return;
    this.app.renderer.resize(width, height);
    this.draw();
  }

  /**
   * Seule la TV suit la caméra : l'aperçu du MJ (`contain`) montre toujours
   * toute la carte.
   */
  private startFocus(to: Camera, holdMs: number): void {
    if (this.style.fit !== 'cover' || !this.view) return;
    const from = this.shownCamera ?? this.view.camera;
    this.focus = { from, to, holdMs, start: performance.now() };
    this.draw();
  }

  /** Pendant un focus, on redessine à chaque image. */
  private readonly tick = (): void => {
    if (this.focus) this.draw();
  };

  /** Chaque calque compare ses entrées par valeur et ne redessine que si besoin. */
  private draw(): void {
    const view = this.view;
    if (!this.layers || !view) return;

    const { width, height } = this.app.screen;
    const layoutFor = (camera: Camera) =>
      computeLayout(width, height, view.grid, camera, this.style.fit);
    const camera = this.focusedCamera(view.camera, (c) => layoutFor(c).camera);
    const layout = layoutFor(camera);
    this.shownCamera = layout.camera;
    this.world.position.set(layout.originX, layout.originY);
    this.world.scale.set(layout.cellPx);

    // Pendant un focus, le brouillard est préparé d'emblée pour le zoom le
    // plus fort : ses textures ne sont pas recréées en plein mouvement.
    const fogCellPx = this.focus
      ? Math.max(
          layout.cellPx,
          ...[this.focus.from, this.focus.to, view.camera].map((c) => layoutFor(c).cellPx),
        )
      : layout.cellPx;

    this.layers.map.update(view.grid);
    this.layers.grid.update(view.grid, layout.cellPx);
    this.layers.fog.update(view.fog, view.grid, fogCellPx);
    this.layers.frame.update(this.frame, view.grid, layout.cellPx);
  }

  /** Caméra du focus en cours, sinon celle de la vue. */
  private focusedCamera(base: Camera, bound: (camera: Camera) => Camera): Camera {
    if (!this.focus) return base;
    const camera = focusCamera(this.focus, performance.now(), base, bound);
    if (camera) return camera;
    this.focus = null;
    return base;
  }
}
