import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { AssetRepository, type AssetInfo } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';
import { VideoControls } from './video-controls';

/** Vidéo de 60 s. */
const INFO: AssetInfo = {
  id: 'video-1',
  name: 'cascade.mp4',
  kind: 'video',
  width: 1920,
  height: 1080,
  duration: 60,
  createdAt: 0,
};

type Fixture = ComponentFixture<VideoControls>;

describe('VideoControls', () => {
  let store: GameStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameStore, { provide: AssetRepository, useValue: { getInfo: async () => INFO } }],
    });
    store = TestBed.inject(GameStore);
    store.addMap({ assetId: 'video-1', name: 'Cascade', kind: 'video' });
  });

  async function render(): Promise<Fixture> {
    const fixture = TestBed.createComponent(VideoControls);
    // La durée est lue de façon asynchrone : on attend qu'elle s'affiche.
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(fixture.nativeElement.textContent).toContain('/ 1:00');
    });
    return fixture;
  }

  function button(fixture: Fixture, selector: string): HTMLButtonElement {
    return fixture.nativeElement.querySelector(selector);
  }

  it('met en avant le bouton Son, coupé par défaut, et l’active sur la TV', async () => {
    const fixture = await render();
    const sound = button(fixture, '[data-sound]');

    expect(sound.textContent).toContain('Son coupé');
    expect(sound.className).toContain('border-amber-400');

    sound.click();
    await fixture.whenStable();

    expect(store.selectedMap()?.playback?.muted).toBe(false);
    expect(sound.textContent).toContain('Son activé sur la TV');
    expect(sound.getAttribute('aria-pressed')).toBe('true');
  });

  it('règle le volume de la TV, sans toucher au bouton Son', async () => {
    const fixture = await render();
    const volume: HTMLInputElement = fixture.nativeElement.querySelector('input[aria-label=Volume]');
    expect(volume.value).toBe('100');

    volume.value = '35';
    volume.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(store.selectedMap()?.playback).toMatchObject({ volume: 0.35, muted: true });
    expect(fixture.nativeElement.textContent).toContain('35 %');
  });

  it('met en pause puis relance la lecture', async () => {
    const fixture = await render();
    const playPause = () => button(fixture, '[aria-label=Pause], [aria-label=Lecture]');

    playPause().click();
    await fixture.whenStable();
    expect(store.selectedMap()?.playback?.playing).toBe(false);
    expect(playPause().getAttribute('aria-label')).toBe('Lecture');

    playPause().click();
    await fixture.whenStable();
    expect(store.selectedMap()?.playback?.playing).toBe(true);
  });

  it('avance à la position choisie sur la barre, au relâchement', async () => {
    const fixture = await render();
    const timeline: HTMLInputElement = fixture.nativeElement.querySelector(
      'input[aria-label="Position dans la vidéo"]',
    );

    timeline.value = '42';
    timeline.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(store.selectedMap()?.playback?.position).toBe(0); // pas encore envoyé à la TV

    timeline.dispatchEvent(new Event('change'));
    expect(store.selectedMap()?.playback?.position).toBe(42);
  });

  it('active ou coupe la boucle', async () => {
    const fixture = await render();
    const loop: HTMLInputElement = fixture.nativeElement.querySelector('input[type=checkbox]');

    expect(loop.checked).toBe(true);
    loop.click();

    expect(store.selectedMap()?.playback?.loop).toBe(false);
  });
});
