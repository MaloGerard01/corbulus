import { TestBed } from '@angular/core/testing';
import { EMPTY } from 'rxjs';

import { createInitialGameState, type GameState } from '../../../core/models/game-state.model';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { SessionRepository, type LoadedSession } from '../../../core/persistence/session.repository';
import { SyncService } from '../../../core/sync/sync.service';
import { DmSyncEffects } from './dm-sync.effects';
import { GameStore } from './game.store';

function session(id: string, dmNotes: string): LoadedSession {
  return { id, name: `Session ${id}`, state: { ...createInitialGameState(), dmNotes } };
}

describe('DmSyncEffects', () => {
  let saved: Map<string, GameState>;
  let repository: {
    load: ReturnType<typeof vi.fn<SessionRepository['load']>>;
    save: ReturnType<typeof vi.fn<SessionRepository['save']>>;
    usedAssetIds: ReturnType<typeof vi.fn<SessionRepository['usedAssetIds']>>;
  };
  let effects: DmSyncEffects;
  let store: GameStore;

  beforeEach(() => {
    const stored: Record<string, LoadedSession> = { a: session('a', 'notes A'), b: session('b', 'notes B') };
    saved = new Map();
    repository = {
      load: vi.fn<SessionRepository['load']>(async (id) => stored[id] ?? null),
      save: vi.fn<SessionRepository['save']>(async (id, state) => void saved.set(id, state)),
      usedAssetIds: vi.fn<SessionRepository['usedAssetIds']>(async () => []),
    };
    TestBed.configureTestingModule({
      providers: [
        GameStore,
        DmSyncEffects,
        { provide: SyncService, useValue: { send: vi.fn(), on: () => EMPTY } },
        { provide: SessionRepository, useValue: repository },
        { provide: AssetRepository, useValue: { deleteUnused: vi.fn(async () => 0) } },
      ],
    });
    effects = TestBed.inject(DmSyncEffects);
    store = TestBed.inject(GameStore);
  });

  it('ouvre une session : son nom et son état', async () => {
    expect(await effects.open('a')).toBe(true);

    expect(effects.session()).toEqual({ id: 'a', name: 'Session a' });
    expect(store.dmNotes()).toBe('notes A');
  });

  it("ne réécrit pas une session qu'on vient seulement d'ouvrir", async () => {
    await effects.open('a');
    await effects.open('b');

    expect(repository.save).not.toHaveBeenCalled();
  });

  it('sauvegarde la session quittée dans la bonne session avant de charger la suivante', async () => {
    await effects.open('a');
    store.setDmNotes('notes A modifiées');

    await effects.open('b');

    expect(saved.get('a')?.dmNotes).toBe('notes A modifiées');
    expect(saved.has('b')).toBe(false);
    expect(store.dmNotes()).toBe('notes B');
  });

  it("signale une session qui n'existe pas", async () => {
    expect(await effects.open('inconnue')).toBe(false);
    expect(effects.session()).toBeNull();
  });

  it('sauvegarde sans attendre quand on quitte la vue MJ', async () => {
    await effects.open('a');
    store.setDmNotes('dernière modification');

    TestBed.resetTestingModule(); // détruit l'injecteur, comme en quittant la route

    await vi.waitFor(() => expect(saved.get('a')?.dmNotes).toBe('dernière modification'));
  });
});
