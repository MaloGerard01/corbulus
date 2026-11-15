import { signal, type WritableSignal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { BoardViewport } from '../../../core/models/sync-message.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';
import { MapsPanel } from './maps-panel';

// jsdom n'implémente pas les URL blob: ; les vignettes en ont besoin.
URL.createObjectURL ??= () => 'blob:';
URL.revokeObjectURL ??= () => undefined;

describe('MapsPanel', () => {
  let assets: {
    addImage: ReturnType<typeof vi.fn<AssetRepository['addImage']>>;
    getInfo: ReturnType<typeof vi.fn<AssetRepository['getInfo']>>;
    getPreview: ReturnType<typeof vi.fn<AssetRepository['getPreview']>>;
  };
  let store: GameStore;
  let boardViewport: WritableSignal<BoardViewport | null>;

  beforeEach(() => {
    boardViewport = signal<BoardViewport | null>(null);
    let next = 0;
    assets = {
      // Chaque image importée mesure 3000 × 2000 px.
      addImage: vi.fn<AssetRepository['addImage']>(async (_file, name) => ({
        id: `image-${++next}`,
        name,
        width: 3000,
        height: 2000,
        createdAt: 0,
      })),
      getInfo: vi.fn<AssetRepository['getInfo']>(async (id) => ({
        id,
        name: id,
        width: 3000,
        height: 2000,
        createdAt: 0,
      })),
      getPreview: vi.fn<AssetRepository['getPreview']>().mockResolvedValue(null),
    };
    TestBed.configureTestingModule({
      providers: [
        GameStore,
        { provide: AssetRepository, useValue: assets },
        { provide: DmSyncEffects, useValue: { boardViewport } },
      ],
    });
    store = TestBed.inject(GameStore);
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(): Promise<ComponentFixture<MapsPanel>> {
    const fixture = TestBed.createComponent(MapsPanel);
    await fixture.whenStable();
    return fixture;
  }

  function selectFiles(fixture: ComponentFixture<MapsPanel>, ...names: string[]): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    const files = names.map((name) => new File(['…'], name, { type: 'image/png' }));
    Object.defineProperty(input, 'files', { value: files });
    input.dispatchEvent(new Event('change'));
  }

  function cards(fixture: ComponentFixture<MapsPanel>): HTMLElement[] {
    return [...fixture.nativeElement.querySelectorAll('app-map-card')];
  }

  async function until(fixture: ComponentFixture<MapsPanel>, check: () => void): Promise<void> {
    await vi.waitFor(async () => {
      await fixture.whenStable();
      check();
    });
  }

  function button(fixture: ComponentFixture<MapsPanel>, label: string): HTMLButtonElement | undefined {
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
    return buttons.find((b) => b.textContent?.trim() === label);
  }

  it("importe plusieurs cartes sans en afficher aucune à l'écran", async () => {
    const fixture = await render();

    selectFiles(fixture, 'taverne_30x20.png', 'crypte.jpg');

    await until(fixture, () => expect(cards(fixture)).toHaveLength(2));
    expect(cards(fixture).map((c) => c.textContent)).toEqual([
      expect.stringContaining('taverne_30x20'),
      expect.stringContaining('crypte'),
    ]);
    expect(fixture.nativeElement.textContent).not.toContain("A l'écran");
    expect(store.maps()[0].grid).toMatchObject({ cols: 30, rows: 20, mapCellPx: 100 });
    expect(store.boardView().mapAssetId).toBeNull();
    // La dernière importée est prête à être modifiée.
    expect(store.selectedMap()?.name).toBe('crypte');
  });

  it('signale les fichiers illisibles sans bloquer les autres', async () => {
    assets.addImage.mockRejectedValueOnce(new DOMException('Image illisible'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = await render();

    selectFiles(fixture, 'notes.txt', 'crypte.jpg');

    await until(fixture, () => expect(fixture.nativeElement.textContent).toContain('notes.txt'));
    expect(fixture.nativeElement.querySelector('[role=alert]').textContent).toContain(
      "Impossible d'importer notes.txt",
    );
    expect(store.maps().map((m) => m.name)).toEqual(['crypte']);
  });

  describe('vignettes', () => {
    beforeEach(() => {
      assets.getPreview.mockResolvedValue({
        thumbnail: new Blob(['vignette'], { type: 'image/webp' }),
        width: 3000,
        height: 2000,
      });
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:vignette');
      store.addMap({
        assetId: 'image-1',
        name: 'Taverne',
        grid: { cols: 30, rows: 20, mapCellPx: 100 },
      });
    });

    it('montre la vignette de chaque carte', async () => {
      const fixture = await render();

      await until(fixture, () =>
        expect(fixture.nativeElement.querySelector('app-map-card img')?.getAttribute('src')).toBe(
          'blob:vignette',
        ),
      );
      expect(assets.getPreview).toHaveBeenCalledWith('image-1');
    });

    it('éclaircit la zone que la TV affichera, en pixels de l’image', async () => {
      // TV 16:9 : toute la largeur de la carte, rognée en haut et en bas.
      boardViewport.set({ width: 1600, height: 900 });
      const fixture = await render();

      let zone!: SVGRectElement;
      await until(fixture, () => {
        zone = fixture.nativeElement.querySelector('[data-visible-zone]');
        expect(zone).not.toBeNull();
      });
      expect(zone.closest('svg')!.getAttribute('viewBox')).toBe('0 0 3000 2000');
      const attr = (name: string) => parseFloat(zone.getAttribute(name)!);
      expect(attr('x')).toBeCloseTo(0);
      expect(attr('y')).toBeCloseTo(156.25);
      expect(attr('width')).toBeCloseTo(3000);
      expect(attr('height')).toBeCloseTo(1687.5);
    });

    it('suit la vue de la carte en édition quand le MJ la déplace', async () => {
      boardViewport.set({ width: 1600, height: 900 });
      const fixture = await render();
      await until(fixture, () =>
        expect(fixture.nativeElement.querySelector('[data-visible-zone]')).not.toBeNull(),
      );

      store.setCamera({ x: 15, y: 0, zoom: 1 }); // tout en haut
      await fixture.whenStable();

      const zone = fixture.nativeElement.querySelector('[data-visible-zone]');
      expect(parseFloat(zone.getAttribute('y'))).toBeCloseTo(0);
    });

    it("n'assombrit rien tant qu'on ne connaît pas la taille de la TV", async () => {
      const fixture = await render();
      await until(fixture, () =>
        expect(fixture.nativeElement.querySelector('app-map-card img')).not.toBeNull(),
      );
      expect(fixture.nativeElement.querySelector('app-map-card svg')).toBeNull();
    });
  });

  it("sélectionne la carte cliquée pour la modifier, sans l'afficher", async () => {
    const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
    store.addMap({ assetId: 'image-2', name: 'Crypte' });
    const fixture = await render();

    cards(fixture)[0].querySelector<HTMLButtonElement>('button[aria-pressed]')!.click();
    await fixture.whenStable();

    expect(store.selectedMap()?.id).toBe(taverne.id);
    expect(store.activeMap()).toBeNull();
    expect(cards(fixture)[0].querySelector('[aria-pressed="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-map-settings h3').textContent).toContain(
      'Taverne',
    );
  });

  it("affiche à l'écran la carte en édition depuis ses propriétés, puis l'en retire", async () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    const crypte = store.addMap({ assetId: 'image-2', name: 'Crypte' });
    const fixture = await render();

    button(fixture, "Afficher à l'écran")!.click();
    await fixture.whenStable();

    expect(store.activeMap()?.id).toBe(crypte.id);
    expect(store.boardView().mapAssetId).toBe('image-2');
    expect(cards(fixture)[1].textContent).toContain("A l'écran");
    expect(cards(fixture)[0].textContent).not.toContain("A l'écran");

    button(fixture, "Retirer de l'écran")!.click();
    await fixture.whenStable();

    expect(store.activeMap()).toBeNull();
    expect(button(fixture, "Afficher à l'écran")).toBeDefined();
  });

  it('retire une carte après confirmation', async () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    store.addMap({ assetId: 'image-2', name: 'Crypte' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = await render();

    cards(fixture)[1].querySelector<HTMLButtonElement>('[aria-label="Retirer Crypte"]')!.click();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('« Crypte »'));
    expect(store.maps().map((m) => m.name)).toEqual(['Taverne']);
    expect(cards(fixture)).toHaveLength(1);
  });

  it('garde la carte si le MJ annule', async () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fixture = await render();

    cards(fixture)[0].querySelector<HTMLButtonElement>('[aria-label="Retirer Taverne"]')!.click();

    expect(store.maps()).toHaveLength(1);
  });

  it('règle la grille de la carte en édition', async () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne', grid: { cols: 5, rows: 5, mapCellPx: 200 } });
    const fixture = await render();
    await until(fixture, () =>
      expect(fixture.nativeElement.textContent).toContain('Ajuster la grille à la carte'),
    );

    const fit = [...fixture.nativeElement.querySelectorAll('button')].find((b: HTMLButtonElement) =>
      b.textContent?.includes('Ajuster'),
    ) as HTMLButtonElement;
    fit.click();

    expect(store.grid()).toMatchObject({ cols: 15, rows: 10, mapCellPx: 200 });
  });
});
