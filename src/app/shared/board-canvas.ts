import {
  Component,
  DestroyRef,
  ElementRef,
  InjectionToken,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';

import type { BoardView } from '../core/models/board-view.model';
import type { BoardEvent } from '../core/models/sync-message.model';
import { AssetRepository } from '../core/persistence/asset.repository';
import { BoardRenderer } from '../renderer/board-renderer';
import type { CellRect } from '../renderer/layout';
import type { RenderMode } from '../renderer/render-style';

/** Ce que le composant utilise du renderer. */
export type BoardRendererLike = Pick<
  BoardRenderer,
  'ready' | 'init' | 'render' | 'setMapImage' | 'setFrame' | 'playEffect' | 'destroy'
>;

/** Remplaçable dans les tests : jsdom n'a pas de WebGL. */
export const BOARD_RENDERER_FACTORY = new InjectionToken<(mode: RenderMode) => BoardRendererLike>(
  'BOARD_RENDERER_FACTORY',
  { providedIn: 'root', factory: () => (mode) => new BoardRenderer(mode) },
);

/**
 * Héberge le renderer PixiJS. Utilisé par le plateau (mode `board`) et par
 * l'aperçu de la vue MJ (mode `dm`).
 *
 * Le parent doit dimensionner ce composant : `contain-strict` empêche le
 * canvas d'influencer sa taille (sinon il ne pourrait jamais rétrécir).
 */
@Component({
  selector: 'app-board-canvas',
  host: { class: 'block contain-strict' },
  template: '',
})
export class BoardCanvas {
  readonly view = input<BoardView | null>(null);
  /** Lu une seule fois, à la création du renderer. */
  readonly mode = input<RenderMode>('board');
  /** Zone à encadrer (aperçu MJ : ce que voit la TV), en cases. */
  readonly frame = input<CellRect | null>(null);

  private readonly _ready = signal(false);
  /** L'init de Pixi 8 est asynchrone : rien n'est dessiné avant. */
  readonly ready = this._ready.asReadonly();

  private readonly assets = inject(AssetRepository);
  private renderer: BoardRendererLike | null = null;

  /**
   * Côté plateau, chaque message recrée la vue (clonage BroadcastChannel) :
   * ce `computed` compare l'identifiant par valeur, la carte n'est donc
   * rechargée que quand elle change vraiment.
   */
  private readonly mapAssetId = computed(() => this.view()?.mapAssetId ?? null);
  /** Numéro du dernier chargement demandé, pour ignorer les réponses obsolètes. */
  private mapRequest = 0;

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const createRenderer = inject(BOARD_RENDERER_FACTORY);

    afterNextRender(() => {
      const renderer = createRenderer(this.mode());
      this.renderer = renderer;
      renderer
        .init(host)
        .then(() => this._ready.set(renderer.ready))
        .catch((err) => console.error("Impossible d'initialiser le rendu du plateau", err));
    });

    effect(() => {
      const view = this.view();
      if (this._ready() && view) this.renderer?.render(view);
    });

    effect(() => {
      const frame = this.frame();
      if (this._ready()) this.renderer?.setFrame(frame);
    });

    effect(() => {
      const mapAssetId = this.mapAssetId();
      if (this._ready()) void this.loadMap(mapAssetId);
    });

    inject(DestroyRef).onDestroy(() => {
      this.mapRequest++;
      this.renderer?.destroy();
      this.renderer = null;
    });
  }

  playEffect(event: BoardEvent): void {
    if (this._ready()) this.renderer?.playEffect(event);
  }

  /** Lit l'image dans IndexedDB (partagée entre la vue MJ et le plateau) et la décode. */
  private async loadMap(mapAssetId: string | null): Promise<void> {
    const request = ++this.mapRequest;

    let image: ImageBitmap | null = null;
    try {
      image = mapAssetId ? await this.assets.loadBitmap(mapAssetId) : null;
      if (mapAssetId && !image) console.warn(`Carte introuvable : ${mapAssetId}`);
    } catch (err) {
      console.error('Impossible de charger la carte', err);
    }

    // Une autre carte a été demandée entre-temps, ou le composant a été détruit.
    if (request !== this.mapRequest || !this.renderer) {
      image?.close();
      return;
    }
    this.renderer.setMapImage(image);
  }
}
