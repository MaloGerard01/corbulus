import { TestBed } from '@angular/core/testing';

import { EFFECT_SOUNDS, EffectSounds } from './effect-sounds';

/** jsdom ne lit pas l'audio : chaque lecture est enregistrée, et réussit ou échoue au choix. */
class FakeAudio {
  static played: string[] = [];
  static refusal: Error | null = null;

  preload = '';

  constructor(readonly src: string) {}

  cloneNode(): FakeAudio {
    return new FakeAudio(this.src);
  }

  play(): Promise<void> {
    FakeAudio.played.push(this.src);
    return FakeAudio.refusal ? Promise.reject(FakeAudio.refusal) : Promise.resolve();
  }
}

describe('EffectSounds', () => {
  let sounds: EffectSounds;

  beforeEach(() => {
    FakeAudio.played = [];
    FakeAudio.refusal = null;
    vi.stubGlobal('Audio', FakeAudio);
    TestBed.configureTestingModule({ providers: [EffectSounds] });
    sounds = TestBed.inject(EffectSounds);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("joue le son de l'explosion, à chaque explosion", async () => {
    const explosion = { kind: 'explosion', x: 2, y: 3, radius: 3 } as const;
    sounds.play(explosion);
    sounds.play(explosion);
    await Promise.resolve();

    expect(FakeAudio.played).toEqual([EFFECT_SOUNDS.explosion, EFFECT_SOUNDS.explosion]);
    expect(sounds.blocked()).toBe(false);
  });

  it('reste muet pour les effets sans son', () => {
    sounds.play({ kind: 'ping', x: 1, y: 1, color: '#3b82f6' });
    sounds.play({ kind: 'shake', durationMs: 1000, amplitude: 0.25 });

    expect(FakeAudio.played).toEqual([]);
  });

  it('propose d’activer le son quand le navigateur le refuse', async () => {
    FakeAudio.refusal = new DOMException('Lecture refusée', 'NotAllowedError');
    sounds.play({ kind: 'explosion', x: 2, y: 3, radius: 3 });
    await vi.waitFor(() => expect(sounds.blocked()).toBe(true));

    sounds.unlock();
    expect(sounds.blocked()).toBe(false);
  });
});
