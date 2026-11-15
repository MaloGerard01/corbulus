import { TestBed, type ComponentFixture } from '@angular/core/testing';

import type { BoardView } from '../core/models/board-view.model';
import { AssetRepository } from '../core/persistence/asset.repository';
import { BOARD_RENDERER_FACTORY, BoardCanvas, type BoardRendererLike } from './board-canvas';

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

function fakeBitmap(name: string): ImageBitmap {
  return { name, close: vi.fn() } as unknown as ImageBitmap;
}

function boardView(mapAssetId: string | null): BoardView {
  return {
    mapAssetId,
    grid: { cols: 24, rows: 14, mapCellPx: 100, offsetX: 0, offsetY: 0 },
    camera: { x: 12, y: 7, zoom: 1 },
    fog: { enabled: false, ops: [] },
    players: [],
  };
}

describe('BoardCanvas', () => {
  let renderer: FakeRenderer;
  let loadBitmap: ReturnType<typeof vi.fn<AssetRepository['loadBitmap']>>;

  beforeEach(() => {
    renderer = new FakeRenderer();
    loadBitmap = vi.fn<AssetRepository['loadBitmap']>(async (id) => fakeBitmap(id));
    TestBed.configureTestingModule({
      providers: [
        { provide: BOARD_RENDERER_FACTORY, useValue: () => renderer },
        { provide: AssetRepository, useValue: { loadBitmap } },
      ],
    });
  });

  async function render(view: BoardView | null): Promise<ComponentFixture<BoardCanvas>> {
    const fixture = TestBed.createComponent(BoardCanvas);
    fixture.componentRef.setInput('view', view);
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(fixture.componentInstance.ready()).toBe(true);
    });
    await fixture.whenStable();
    return fixture;
  }

  async function setView(fixture: ComponentFixture<BoardCanvas>, view: BoardView): Promise<void> {
    fixture.componentRef.setInput('view', view);
    await fixture.whenStable();
  }

  it('dessine la vue et charge sa carte une fois le renderer prêt', async () => {
    const view = boardView('carte-1');
    await render(view);

    expect(renderer.render).toHaveBeenCalledWith(view);
    await vi.waitFor(() =>
      expect(renderer.setMapImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'carte-1' })),
    );
    expect(loadBitmap).toHaveBeenCalledExactlyOnceWith('carte-1');
  });

  it('ne recharge pas la carte quand seul le reste de la vue change', async () => {
    const fixture = await render(boardView('carte-1'));

    // Comme côté plateau : chaque message arrive cloné par BroadcastChannel.
    const next = structuredClone(boardView('carte-1'));
    next.fog.enabled = true;
    await setView(fixture, next);

    expect(renderer.render).toHaveBeenLastCalledWith(next);
    expect(loadBitmap).toHaveBeenCalledOnce();
  });

  it('ignore une carte dont le chargement a été dépassé par un autre', async () => {
    let resolveSlow!: (bitmap: ImageBitmap) => void;
    const slow = fakeBitmap('lente');
    loadBitmap.mockImplementationOnce(
      () => new Promise<ImageBitmap>((resolve) => (resolveSlow = resolve)),
    );

    const fixture = await render(boardView('lente'));
    await setView(fixture, boardView('rapide'));
    await vi.waitFor(() =>
      expect(renderer.setMapImage).toHaveBeenCalledWith(expect.objectContaining({ name: 'rapide' })),
    );

    resolveSlow(slow);
    await vi.waitFor(() => expect(slow.close).toHaveBeenCalled());
    expect(renderer.setMapImage).not.toHaveBeenCalledWith(slow);
  });

  it('retire la carte du rendu quand la vue n’en a plus', async () => {
    const fixture = await render(boardView('carte-1'));
    await vi.waitFor(() => expect(renderer.setMapImage).toHaveBeenCalled());

    await setView(fixture, boardView(null));

    await vi.waitFor(() => expect(renderer.setMapImage).toHaveBeenLastCalledWith(null));
  });

  it('détruit le renderer avec le composant', async () => {
    const fixture = await render(null);
    fixture.destroy();
    expect(renderer.destroy).toHaveBeenCalled();
  });
});
