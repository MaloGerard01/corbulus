import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { Camera } from '../../../core/models/game-state.model';
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

/**
 * jsdom n'a pas de ResizeObserver : l'aperçu mesure 800 × 800 px, la grille
 * 20 × 20 y est donc affichée à 40 px la case, depuis le coin (0, 0).
 */
class FakeResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}

  observe(target: Element): void {
    const entry = { target, contentRect: { width: 800, height: 800 } } as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }

  unobserve(): void {}
  disconnect(): void {}
}

/** TV 16:9 : en mode cover, 20 × 11,25 cases de la grille 20 × 20 sont visibles. */
const TV: BoardViewport = { width: 1600, height: 900 };

describe('BoardPreview', () => {
  let store: GameStore;
  let renderer: FakeRenderer;
  let boardViewport: WritableSignal<BoardViewport | null>;

  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
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
    store.updateGrid({ cols: 20, rows: 20 });
    store.setCamera({ x: 10, y: 10, zoom: 1 });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(): Promise<ComponentFixture<BoardPreview>> {
    const fixture = TestBed.createComponent(BoardPreview);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(renderer.setFrame).toHaveBeenCalled();
    });
    return fixture;
  }

  function query<T extends Element>(fixture: ComponentFixture<BoardPreview>, selector: string): T {
    return fixture.nativeElement.querySelector(selector);
  }

  function preciseCheckbox(fixture: ComponentFixture<BoardPreview>): HTMLInputElement {
    const labels: HTMLLabelElement[] = [...fixture.nativeElement.querySelectorAll('label')];
    return labels.find((l) => l.textContent?.includes('Mode précis'))!.querySelector('input')!;
  }

  /** Les événements partent du canvas et remontent jusqu'à la surface de l'aperçu. */
  function pointer(target: Element, type: string, clientX: number, clientY: number): void {
    target.dispatchEvent(new PointerEvent(type, { clientX, clientY, button: 0, bubbles: true }));
  }

  function expectCamera(expected: Camera): void {
    const camera = store.camera();
    expect(camera.x).toBeCloseTo(expected.x);
    expect(camera.y).toBeCloseTo(expected.y);
    expect(camera.zoom).toBeCloseTo(expected.zoom);
  }

  function handlePosition(fixture: ComponentFixture<BoardPreview>, corner: string) {
    const handle = query<HTMLElement>(fixture, `[data-corner="${corner}"]`);
    return { left: parseFloat(handle.style.left), top: parseFloat(handle.style.top) };
  }

  it("désactive le mode précis tant qu'on ne connaît pas la taille de la TV", async () => {
    const fixture = await render();

    expect(renderer.setFrame).toHaveBeenLastCalledWith(null);
    expect(preciseCheckbox(fixture).disabled).toBe(true);
    expect(preciseCheckbox(fixture).closest('label')!.title).toContain('Ouvrez le plateau');
  });

  it('encadre la partie de la carte visible sur la TV', async () => {
    const fixture = await render();

    boardViewport.set(TV);
    await fixture.whenStable();

    expect(renderer.setFrame).toHaveBeenLastCalledWith({ x: 0, y: 4.375, w: 20, h: 11.25 });
    expect(preciseCheckbox(fixture).disabled).toBe(false);
  });

  it('déplace le cadre en glissant, sans le faire sortir de la grille', async () => {
    boardViewport.set(TV);
    const fixture = await render();
    const canvas = query(fixture, 'app-board-canvas');

    pointer(canvas, 'pointerdown', 400, 400);
    pointer(canvas, 'pointermove', 400, 320); // 2 cases vers le haut
    expect(store.camera()).toEqual({ x: 10, y: 8, zoom: 1 });

    pointer(canvas, 'pointermove', 400, 0); // bute contre le haut de la grille
    expect(store.camera()).toEqual({ x: 10, y: 5.625, zoom: 1 });

    pointer(canvas, 'pointerup', 400, 0);
    pointer(canvas, 'pointermove', 400, 400);
    expect(store.camera()).toEqual({ x: 10, y: 5.625, zoom: 1 });
  });

  it('ne déplace rien tant que la taille de la TV est inconnue', async () => {
    const fixture = await render();
    const canvas = query(fixture, 'app-board-canvas');

    pointer(canvas, 'pointerdown', 400, 400);
    pointer(canvas, 'pointermove', 400, 320);

    expect(store.camera()).toEqual({ x: 10, y: 10, zoom: 1 });
  });

  it('mode précis : affiche des poignées aux coins du cadre', async () => {
    boardViewport.set(TV);
    const fixture = await render();
    expect(query(fixture, '[data-corner]')).toBeNull();

    preciseCheckbox(fixture).click();
    await fixture.whenStable();

    expect(store.preciseView()).toBe(true);
    // Cadre (0 ; 4,375) → (20 ; 15,625) cases, à 40 px la case.
    expect(handlePosition(fixture, 'top-left')).toEqual({ left: 0, top: 175 });
    expect(handlePosition(fixture, 'bottom-right')).toEqual({ left: 800, top: 625 });
  });

  it('mode précis : la poignée bas droite zoome en gardant le coin haut gauche', async () => {
    boardViewport.set(TV);
    store.setPreciseView(true);
    const fixture = await render();
    await fixture.whenStable();
    const handle = query(fixture, '[data-corner="bottom-right"]');

    pointer(handle, 'pointerdown', 800, 625);
    pointer(handle, 'pointermove', 400, 400); // cadre deux fois moins large
    pointer(handle, 'pointerup', 400, 400);
    await fixture.whenStable();

    expectCamera({ x: 5, y: 7.1875, zoom: 2 });
    const topLeft = handlePosition(fixture, 'top-left');
    const bottomRight = handlePosition(fixture, 'bottom-right');
    expect(topLeft.left).toBeCloseTo(0);
    expect(topLeft.top).toBeCloseTo(175);
    expect(bottomRight.left).toBeCloseTo(400);
    expect(bottomRight.top).toBeCloseTo(400);
  });

  it('décocher le mode précis ramène la carte entière et retire les poignées', async () => {
    boardViewport.set(TV);
    store.setPreciseView(true);
    store.setCamera({ x: 5, y: 7, zoom: 2 });
    const fixture = await render();

    preciseCheckbox(fixture).click();
    await fixture.whenStable();

    expect(store.camera().zoom).toBe(1);
    expect(query(fixture, '[data-corner]')).toBeNull();
  });
});
