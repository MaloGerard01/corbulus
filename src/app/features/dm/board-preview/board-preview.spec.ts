import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { BoardViewport } from '../../../core/models/sync-message.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { BOARD_RENDERER_FACTORY, type BoardRendererLike } from '../../../shared/board-canvas';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';
import { BoardPreview } from './board-preview';

/** Renderer factice : jsdom n'a pas de WebGL. */
class FakeRenderer implements BoardRendererLike {
  ready = false;
  readonly render = vi.fn();
  readonly setMapImage = vi.fn();
  readonly setFrame = vi.fn();
  readonly playEffect = vi.fn();
  readonly destroy = vi.fn();

  async init(): Promise<void> {
    this.ready = true;
  }
}

describe('BoardPreview', () => {
  let store: GameStore;
  let renderer: FakeRenderer;
  let boardViewport: WritableSignal<BoardViewport | null>;

  beforeEach(() => {
    renderer = new FakeRenderer();
    boardViewport = signal<BoardViewport | null>(null);
    TestBed.configureTestingModule({
      providers: [
        GameStore,
        { provide: DmSyncEffects, useValue: { boardViewport } },
        { provide: BOARD_RENDERER_FACTORY, useValue: () => renderer },
        { provide: AssetRepository, useValue: { loadBitmap: async () => null } },
      ],
    });
    store = TestBed.inject(GameStore);
    // Grille carrée sur une TV 16:9 : en mode cover, 20 × 11,25 cases sont visibles.
    store.updateGrid({ cols: 20, rows: 20 });
    store.setCamera({ x: 10, y: 10 });
  });

  async function render(): Promise<ComponentFixture<BoardPreview>> {
    const fixture = TestBed.createComponent(BoardPreview);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(renderer.setFrame).toHaveBeenCalled();
    });
    return fixture;
  }

  /** Aperçu de 800 × 800 px : la grille 20 × 20 y est affichée à 40 px la case. */
  function previewElement(fixture: ComponentFixture<BoardPreview>): HTMLElement {
    const element: HTMLElement = fixture.nativeElement.querySelector('app-board-canvas');
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 800,
      height: 800,
    } as DOMRect);
    return element;
  }

  function pointer(element: HTMLElement, type: string, clientX: number, clientY: number): void {
    element.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, bubbles: true }));
  }

  it("invite à ouvrir le plateau tant qu'on ne connaît pas la taille de la TV", async () => {
    const fixture = await render();

    expect(renderer.setFrame).toHaveBeenLastCalledWith(null);
    expect(fixture.nativeElement.textContent).toContain('Ouvrez le plateau');
  });

  it('encadre la partie de la carte visible sur la TV', async () => {
    const fixture = await render();

    boardViewport.set({ width: 1600, height: 900 });
    await fixture.whenStable();

    expect(renderer.setFrame).toHaveBeenLastCalledWith({ x: 0, y: 4.375, w: 20, h: 11.25 });
    expect(fixture.nativeElement.textContent).toContain('Le cadre montre ce qu');
  });

  it('déplace le cadre en glissant, sans le faire sortir de la grille', async () => {
    boardViewport.set({ width: 1600, height: 900 });
    const fixture = await render();
    const element = previewElement(fixture);

    pointer(element, 'pointerdown', 400, 400);
    pointer(element, 'pointermove', 400, 320); // 2 cases vers le haut
    expect(store.camera()).toEqual({ x: 10, y: 8 });

    pointer(element, 'pointermove', 400, 0); // bute contre le haut de la grille
    expect(store.camera()).toEqual({ x: 10, y: 5.625 });

    pointer(element, 'pointerup', 400, 0);
    pointer(element, 'pointermove', 400, 400);
    expect(store.camera()).toEqual({ x: 10, y: 5.625 });
  });

  it('ne déplace rien tant que la taille de la TV est inconnue', async () => {
    const fixture = await render();
    const element = previewElement(fixture);

    pointer(element, 'pointerdown', 400, 400);
    pointer(element, 'pointermove', 400, 320);

    expect(store.camera()).toEqual({ x: 10, y: 10 });
  });
});
