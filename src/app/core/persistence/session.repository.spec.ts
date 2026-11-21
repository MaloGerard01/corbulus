import { createInitialGameState } from '../models/game-state.model';
import type { SessionRecord } from './db';
import { normalizeSessionName, summarizeSession } from './session.repository';

describe('normalizeSessionName', () => {
  it('retire les espaces superflus', () => {
    expect(normalizeSessionName('  La   taverne  ')).toBe('La taverne');
  });

  it('borne la longueur et ne laisse jamais un nom vide', () => {
    expect(normalizeSessionName('x'.repeat(200))).toHaveLength(80);
    expect(normalizeSessionName('   ')).toBe('Session sans nom');
  });
});

describe('summarizeSession', () => {
  it('compte les cartes et les joueurs', () => {
    const state = createInitialGameState();
    const record: SessionRecord = {
      id: 'taverne',
      name: 'La taverne',
      updatedAt: 42,
      state: {
        ...state,
        players: [
          {
            id: 'p1',
            name: 'Aria',
            color: '#f00',
            seat: 'bottom',
            seatPosition: null,
            portraitAssetId: null,
            hp: 10,
            hpMax: 10,
            gold: 0,
          },
        ],
      },
    };

    expect(summarizeSession(record)).toEqual({
      id: 'taverne',
      name: 'La taverne',
      updatedAt: 42,
      mapCount: 0,
      playerCount: 1,
    });
  });

  it("résume aussi une sauvegarde d'avant les cartes multiples", () => {
    const legacy = { mapAssetId: 'image-1', players: [] } as unknown as SessionRecord['state'];
    const record: SessionRecord = { id: 'current', name: 'Session en cours', updatedAt: 1, state: legacy };

    expect(summarizeSession(record).mapCount).toBe(1);
  });
});
