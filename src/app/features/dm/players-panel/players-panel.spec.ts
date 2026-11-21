import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { AssetRepository } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';
import { HudPlacement } from '../state/hud-placement';
import { PlayersPanel } from './players-panel';

type Fixture = ComponentFixture<PlayersPanel>;

describe('PlayersPanel', () => {
  let store: GameStore;
  let placement: HudPlacement;
  let addMedia: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    addMedia = vi.fn(async () => ({ id: 'portrait-1' }));
    TestBed.configureTestingModule({
      providers: [
        GameStore,
        HudPlacement,
        { provide: AssetRepository, useValue: { addMedia, getPreview: async () => null } },
      ],
    });
    store = TestBed.inject(GameStore);
    placement = TestBed.inject(HudPlacement);
    store.addPlayer();
  });

  async function render(): Promise<Fixture> {
    const fixture = TestBed.createComponent(PlayersPanel);
    await fixture.whenStable();
    return fixture;
  }

  function seatSelect(fixture: Fixture): HTMLSelectElement {
    return fixture.nativeElement.querySelector('select[aria-label="Place à table"]');
  }

  async function chooseSeat(fixture: Fixture, value: string): Promise<void> {
    const select = seatSelect(fixture);
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
  }

  function button(fixture: Fixture, label: string): HTMLButtonElement {
    const buttons: HTMLButtonElement[] = [...fixture.nativeElement.querySelectorAll('button')];
    return buttons.find((b) => b.textContent?.trim() === label)!;
  }

  it('« Personnalisée » lance le placement sur l’aperçu, sans encore changer la place', async () => {
    const fixture = await render();
    const player = store.players()[0];

    await chooseSeat(fixture, 'custom');

    expect(placement.playerId()).toBe(player.id);
    expect(store.players()[0]).toMatchObject({ seat: player.seat, seatPosition: null });
    expect(seatSelect(fixture).value).toBe('custom');
    expect(fixture.nativeElement.querySelector('[data-placement-hint]')).not.toBeNull();

    button(fixture, 'Annuler').click();
    await fixture.whenStable();
    expect(placement.playerId()).toBeNull();
    expect(seatSelect(fixture).value).toBe(player.seat);
  });

  it('revient à une place de base en oubliant la position personnalisée', async () => {
    const id = store.players()[0].id;
    store.updatePlayer(id, { seat: 'left', seatPosition: 0.2 });
    const fixture = await render();
    expect(seatSelect(fixture).value).toBe('custom');

    await chooseSeat(fixture, 'top');

    expect(store.players()[0]).toMatchObject({ seat: 'top', seatPosition: null });
  });

  it('choisit le style des cartes de tous les joueurs', async () => {
    const fixture = await render();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector(
      'select[aria-label="Style des cartes"]',
    );
    expect(select.value).toBe('classic');

    select.value = 'fantasy';
    select.dispatchEvent(new Event('change'));

    expect(store.hudTheme()).toBe('fantasy');
  });

  it('importe le portrait du personnage, puis peut le retirer', async () => {
    const fixture = await render();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=file]');
    const file = new File(['image'], 'aria.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file] });

    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(store.players()[0].portraitAssetId).toBe('portrait-1'));
    expect(addMedia).toHaveBeenCalledWith(file, 'aria.png');

    await fixture.whenStable();
    button(fixture, 'Retirer').click();
    expect(store.players()[0].portraitAssetId).toBeNull();
  });
});
