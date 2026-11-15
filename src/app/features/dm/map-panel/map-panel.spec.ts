import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { AssetRepository, type AssetInfo } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';
import { MapPanel } from './map-panel';

describe('MapPanel', () => {
  const info: AssetInfo = {
    id: 'carte-1',
    name: 'taverne_30x20.png',
    width: 3000,
    height: 2000,
    createdAt: 0,
  };

  let assets: {
    addImage: ReturnType<typeof vi.fn<AssetRepository['addImage']>>;
    getInfo: ReturnType<typeof vi.fn<AssetRepository['getInfo']>>;
  };
  let store: GameStore;

  beforeEach(() => {
    assets = {
      addImage: vi.fn<AssetRepository['addImage']>().mockResolvedValue(info),
      getInfo: vi.fn<AssetRepository['getInfo']>().mockResolvedValue(info),
    };
    TestBed.configureTestingModule({
      providers: [GameStore, { provide: AssetRepository, useValue: assets }],
    });
    store = TestBed.inject(GameStore);
  });

  afterEach(() => vi.restoreAllMocks());

  async function render(): Promise<ComponentFixture<MapPanel>> {
    const fixture = TestBed.createComponent(MapPanel);
    await fixture.whenStable();
    return fixture;
  }

  function selectFile(fixture: ComponentFixture<MapPanel>, file: File): void {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { value: [file] });
    input.dispatchEvent(new Event('change'));
  }

  /** Attend que l'import asynchrone soit fini et que la vue soit à jour. */
  async function expectText(fixture: ComponentFixture<MapPanel>, text: string): Promise<void> {
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain(text);
    });
  }

  it("stocke l'image puis ne référence que son identifiant, avec la grille devinée", async () => {
    const fixture = await render();
    const file = new File(['…'], 'taverne_30x20.png', { type: 'image/png' });

    selectFile(fixture, file);

    await expectText(fixture, 'taverne_30x20.png · 3000 × 2000 px');
    expect(assets.addImage).toHaveBeenCalledWith(file, 'taverne_30x20.png');
    expect(store.boardView().mapAssetId).toBe('carte-1');
    expect(store.grid()).toMatchObject({ cols: 30, rows: 20, mapCellPx: 100 });
  });

  it("signale un fichier illisible sans toucher à l'état", async () => {
    assets.addImage.mockRejectedValue(new DOMException('Image illisible', 'InvalidStateError'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fixture = await render();
    const before = store.state();

    selectFile(fixture, new File(['pas une image'], 'notes.txt'));

    await expectText(fixture, "Impossible d'importer ce fichier");
    expect(store.state()).toBe(before);
  });

  it('retire la carte après confirmation', async () => {
    store.setMap('carte-1');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const fixture = await render();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === 'Retirer',
    ) as HTMLButtonElement;
    button.click();

    expect(store.mapAssetId()).toBeNull();
    await expectText(fixture, 'Aucune carte');
  });

  it('ajuste la grille pour couvrir toute la carte', async () => {
    store.setMap('carte-1', { cols: 5, rows: 5, mapCellPx: 200 });
    const fixture = await render();
    await expectText(fixture, 'Ajuster la grille à la carte');

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (b: HTMLButtonElement) => b.textContent?.includes('Ajuster'),
    ) as HTMLButtonElement;
    button.click();

    expect(store.grid()).toMatchObject({ cols: 15, rows: 10, mapCellPx: 200 });
  });
});
