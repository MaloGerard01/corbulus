import { Application, Container } from 'pixi.js';

import type { BoardView } from '../core/models/board-view.model';
import type { BoardEvent } from '../core/models/sync-message.model';
import { EffectsLayer } from './layers/effects-layer';
import { FogLayer } from './layers/fog-layer';
import { GridLayer } from './layers/grid-layer';
import { MapLayer, type MapImageSource } from './layers/map-layer';
import { computeLayout } from './layout';
import { RENDER_STYLES, type RenderMode } from './render-style';

interface Layers {
  map: MapLayer;
  grid: GridLayer;
  fog: FogLayer;
  effects: EffectsLayer;
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
 */
export class BoardRenderer {
  private readonly app = new Application();
  private readonly world = new Container();
  private layers: Layers | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private view: BoardView | null = null;
  private destroyed = false;

  constructor(private readonly mode: RenderMode) {}

  get ready(): boolean {
    return this.layers !== null;
  }

  /**
   * Crée le canvas dans `host`, qui doit être positionné (relative, absolute…)
   * et dimensionné par son parent : le canvas en prend toute la place.
   */
  async init(host: HTMLElement): Promise<void> {
    const style = RENDER_STYLES[this.mode];

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
    };
    // Ordre d'empilement : carte, grille, brouillard, effets.
    this.world.addChild(layers.map.view, layers.grid.view, layers.fog.view, layers.effects.view);
    this.app.stage.addChild(this.world);
    this.layers = layers;

    this.resizeObserver = new ResizeObserver(() => {
      this.resize(host.clientWidth, host.clientHeight);
    });
    this.resizeObserver.observe(host);

    this.draw();
  }

  render(view: BoardView): void {
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
    this.layers?.effects.play(event);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObserver?.disconnect();

    // Si l'init est en cours, c'est elle qui détruira l'application à la fin.
    if (!this.layers) return;

    const { map, grid, fog, effects } = this.layers;
    this.layers = null;
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

  /** Chaque calque compare ses entrées par valeur et ne redessine que si besoin. */
  private draw(): void {
    const view = this.view;
    if (!this.layers || !view) return;

    const { width, height } = this.app.screen;
    const layout = computeLayout(width, height, view.grid);
    this.world.position.set(layout.originX, layout.originY);
    this.world.scale.set(layout.cellPx);

    this.layers.map.update(view.grid);
    this.layers.grid.update(view.grid, layout.cellPx);
    this.layers.fog.update(view.fog, view.grid, layout.cellPx);
  }
}
