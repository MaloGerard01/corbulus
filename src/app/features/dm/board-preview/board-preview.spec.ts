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

type Fixture = ComponentFixture<BoardPreview>;

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
    // Carte 20 × 20 en édition, caméra centrée.
    store.addMap({ assetId: 'image-1', name: 'Taverne', grid: { cols: 20, rows: 20 } });
  });

  afterEach(() => vi.unstubAllGlobals());

  async function render(): Promise<Fixture> {
    const fixture = TestBed.createComponent(BoardPreview);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(renderer.setFrame).toHaveBeenCalled();
    });
    return fixture;
  }

  function query<T extends Element>(fixture: Fixture, selector: string): T {
    return fixture.nativeElement.querySelector(selector);
  }

  function canvas(fixture: Fixture): Element {
    return query(fixture, 'app-board-canvas');
  }

  /** Ouvre (ou referme) une section de la barre d'outils. */
  async function toggleSection(fixture: Fixture, label: 'Affichage' | 'Brouillard'): Promise<void> {
    const headers: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button[aria-expanded]')];
    headers.find((h) => h.textContent?.includes(label))!.click();
    await fixture.whenStable();
  }

  function preciseCheckbox(fixture: Fixture): HTMLInputElement {
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

  function handlePosition(fixture: Fixture, corner: string) {
    const handle = query<HTMLElement>(fixture, `[data-corner="${corner}"]`);
    return { left: parseFloat(handle.style.left), top: parseFloat(handle.style.top) };
  }

  it('montre la carte en édition, en indiquant si elle est à l’écran', async () => {
    const fixture = await render();
    const status = () => query(fixture, '[data-status]').textContent?.trim();

    expect(renderer.render).toHaveBeenLastCalledWith(expect.objectContaining({ mapAssetId: 'image-1' }));
    expect(query(fixture, 'header').textContent).toContain('Taverne');
    expect(status()).toBe('Non affichée');

    store.activateMap(store.selectedMap()!.id);
    await fixture.whenStable();
    expect(status()).toBe("À l'écran");
  });

  it('encadre la partie de la carte visible sur la TV', async () => {
    const fixture = await render();

    boardViewport.set(TV);
    await fixture.whenStable();

    expect(renderer.setFrame).toHaveBeenLastCalledWith({ x: 0, y: 4.375, w: 20, h: 11.25 });
  });

  it('reste en lecture seule tant qu’aucune section n’est ouverte', async () => {
    boardViewport.set(TV);
    const fixture = await render();

    pointer(canvas(fixture), 'pointermove', 300, 200);
    pointer(canvas(fixture), 'pointerdown', 400, 400);
    pointer(canvas(fixture), 'pointermove', 400, 320);
    await fixture.whenStable();

    expect(store.camera()).toEqual({ x: 10, y: 10, zoom: 1 });
    expect(store.fog().ops).toEqual([]);
    expect(query(fixture, '[data-brush-cursor]')).toBeNull();
  });

  describe('section Affichage', () => {
    it('déplace le cadre en glissant, sans le faire sortir de la grille', async () => {
      boardViewport.set(TV);
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');

      pointer(canvas(fixture), 'pointerdown', 400, 400);
      pointer(canvas(fixture), 'pointermove', 400, 320); // 2 cases vers le haut
      expect(store.camera()).toEqual({ x: 10, y: 8, zoom: 1 });

      pointer(canvas(fixture), 'pointermove', 400, 0); // bute contre le haut de la grille
      expect(store.camera()).toEqual({ x: 10, y: 5.625, zoom: 1 });

      pointer(canvas(fixture), 'pointerup', 400, 0);
      pointer(canvas(fixture), 'pointermove', 400, 400);
      expect(store.camera()).toEqual({ x: 10, y: 5.625, zoom: 1 });
    });

    it('repasse en lecture seule une fois refermée', async () => {
      boardViewport.set(TV);
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');
      await toggleSection(fixture, 'Affichage');

      pointer(canvas(fixture), 'pointerdown', 400, 400);
      pointer(canvas(fixture), 'pointermove', 400, 320);

      expect(store.camera()).toEqual({ x: 10, y: 10, zoom: 1 });
    });

    it('explique pourquoi la vue ne se règle pas sans taille de TV', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');

      pointer(canvas(fixture), 'pointerdown', 400, 400);
      pointer(canvas(fixture), 'pointermove', 400, 320);

      expect(store.camera()).toEqual({ x: 10, y: 10, zoom: 1 });
      expect(preciseCheckbox(fixture).disabled).toBe(true);
      expect(query(fixture, '#preview-tools-display').textContent).toContain('Ouvrez le plateau');
    });

    it('explique pourquoi la vue ne se règle pas sans carte sélectionnée', async () => {
      boardViewport.set(TV);
      store.selectMap(null);
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');

      expect(preciseCheckbox(fixture).disabled).toBe(true);
      expect(query(fixture, '#preview-tools-display').textContent).toContain('Sélectionnez une carte');
    });

    it('mode précis : affiche des poignées aux coins du cadre', async () => {
      boardViewport.set(TV);
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');
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
      await toggleSection(fixture, 'Affichage');
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
      await toggleSection(fixture, 'Affichage');

      preciseCheckbox(fixture).click();
      await fixture.whenStable();

      expect(store.camera().zoom).toBe(1);
      expect(query(fixture, '[data-corner]')).toBeNull();
    });
  });

  describe('section Brouillard', () => {
    /** Clique un choix de la section (pinceau ou style) par son libellé. */
    async function choose(fixture: Fixture, label: string): Promise<void> {
      const radios: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role=radio]')];
      radios.find((r) => r.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    }

    async function clickButton(fixture: Fixture, label: string): Promise<void> {
      const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
      buttons.find((b) => b.textContent?.trim() === label)!.click();
      await fixture.whenStable();
    }

    async function setSlider(fixture: Fixture, label: string, value: number): Promise<void> {
      const slider = query<HTMLInputElement>(fixture, `input[aria-label=${label}]`);
      slider.value = String(value);
      slider.dispatchEvent(new Event('input'));
      await fixture.whenStable();
    }

    it('peint du brouillard au pinceau, en cases, avec le style choisi', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      await choose(fixture, 'Brouillard de guerre');

      pointer(canvas(fixture), 'pointerdown', 100, 100); // case (2,5 ; 2,5)
      pointer(canvas(fixture), 'pointermove', 200, 100);
      pointer(canvas(fixture), 'pointermove', 204, 100); // trop près du point précédent : ignoré
      pointer(canvas(fixture), 'pointerup', 204, 100);

      expect(store.fog().ops).toEqual([
        expect.objectContaining({
          kind: 'brush',
          mode: 'hide',
          style: 'fog',
          size: 2,
          fade: 2,
          points: [
            [2.5, 2.5],
            [5, 2.5],
          ],
        }),
      ]);
    });

    it('applique la taille et la douceur (fondu en cases) au tracé suivant', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      await setSlider(fixture, 'Taille', 5);
      await setSlider(fixture, 'Douceur', 1);

      pointer(canvas(fixture), 'pointerdown', 100, 100);

      expect(query(fixture, '#preview-tools-fog').textContent).toContain('1 case');
      expect(store.fog().ops).toMatchObject([{ kind: 'brush', size: 5, fade: 1 }]);
    });

    it('dévoile avec le pinceau Effacer', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      await choose(fixture, 'Effacer');

      pointer(canvas(fixture), 'pointerdown', 100, 100);

      expect(store.fog().ops).toMatchObject([{ kind: 'brush', mode: 'reveal' }]);
    });

    it('montre le cœur et l’étendue du fondu sous le pointeur', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');

      pointer(canvas(fixture), 'pointermove', 300, 200);
      await fixture.whenStable();
      const core = () => query<HTMLElement>(fixture, '[data-brush-cursor]');
      const fade = () => query<HTMLElement>(fixture, '[data-brush-fade]');
      // Cœur de 2 cases et fondu de 2 cases de chaque côté, à 40 px la case.
      expect(core().style).toMatchObject({ left: '300px', top: '200px', width: '80px' });
      expect(fade().style.width).toBe('240px');

      await setSlider(fixture, 'Taille', 5);
      expect(core().style.width).toBe('200px');
      expect(fade().style.width).toBe('360px');

      await setSlider(fixture, 'Douceur', 0);
      expect(fade()).toBeNull();
      expect(query(fixture, '#preview-tools-fog').textContent).toContain('bord net');
    });

    it('ne déplace pas le cadre et masque les poignées pendant qu’on peint', async () => {
      boardViewport.set(TV);
      store.setPreciseView(true);
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');

      pointer(canvas(fixture), 'pointerdown', 400, 400);
      pointer(canvas(fixture), 'pointermove', 400, 320);

      expect(query(fixture, '[data-corner]')).toBeNull();
      expect(store.camera()).toEqual({ x: 10, y: 10, zoom: 1 });
    });

    it('couvre et dévoile toute la carte depuis la section', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      await choose(fixture, 'Brouillard de guerre');

      await clickButton(fixture, 'Tout couvrir');
      await clickButton(fixture, 'Tout dévoiler');

      expect(store.fog().ops).toMatchObject([
        { kind: 'fill', mode: 'hide', style: 'fog' },
        { kind: 'fill', mode: 'reveal' },
      ]);
    });

    it('montre une pastille de couleur devant chaque style', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      const group = query(fixture, '[aria-label="Style du brouillard"]');
      const swatches = [...group.querySelectorAll<HTMLElement>('[role=radio] > span')];

      expect(swatches).toHaveLength(2);
      expect(swatches[0].style.background).toContain('rgb(0, 0, 0)');
      expect(swatches[1].style.background).toContain('radial-gradient');
    });

    it('active ou désactive le brouillard depuis la section', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      const labels: HTMLLabelElement[] = [...fixture.nativeElement.querySelectorAll('#preview-tools-fog label')];
      const enable = labels.find((l) => l.textContent?.trim() === 'Activer')!.querySelector('input')!;

      expect(enable.checked).toBe(true);
      enable.click();
      await fixture.whenStable();

      expect(store.fog().enabled).toBe(false);
      expect(query(fixture, 'header input')).toBeNull();
    });

    it('désactive le pinceau sans carte sélectionnée', async () => {
      store.selectMap(null);
      const fixture = await render();
      await toggleSection(fixture, 'Brouillard');
      const radios: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('[role=radio]')];

      expect(radios.filter((r) => r.disabled).map((r) => r.textContent?.trim())).toEqual([
        'Peindre',
        'Effacer',
        'Obscurité',
        'Brouillard de guerre',
      ]);
      expect(query(fixture, '#preview-tools-fog').textContent).toContain('Sélectionnez une carte');
    });

    it('ferme la section Affichage en ouvrant Brouillard (une seule à la fois)', async () => {
      const fixture = await render();
      await toggleSection(fixture, 'Affichage');
      await toggleSection(fixture, 'Brouillard');

      expect(query(fixture, '#preview-tools-display')).toBeNull();
      expect(query(fixture, '#preview-tools-fog')).not.toBeNull();
    });
  });

  it('annule avec Ctrl+Z, sauf pendant la saisie dans un champ de texte', async () => {
    await render();
    store.fillFog('hide', 'darkness');
    store.fillFog('hide', 'fog');

    const notes = document.body.appendChild(document.createElement('textarea'));
    notes.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    expect(store.fog().ops).toHaveLength(2);
    notes.remove();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(store.fog().ops).toHaveLength(1);
  });
});
