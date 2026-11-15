import { TestBed } from '@angular/core/testing';

import { GameStore } from './game.store';

describe('GameStore', () => {
  let store: GameStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GameStore] });
    store = TestBed.inject(GameStore);
  });

  it('ajoute un joueur avec des valeurs par défaut', () => {
    store.addPlayer();
    expect(store.players()).toHaveLength(1);
    expect(store.players()[0].hp).toBe(10);
  });

  it('borne les PV entre 0 et le max', () => {
    store.addPlayer();
    const id = store.players()[0].id;

    store.adjustHp(id, -50);
    expect(store.players()[0].hp).toBe(0);

    store.adjustHp(id, 50);
    expect(store.players()[0].hp).toBe(10);
  });

  it("ne change pas la vue plateau quand seules les notes changent", () => {
    store.addPlayer();
    const before = store.boardView();

    store.setDmNotes('Le traître est le forgeron');

    expect(store.boardView()).toBe(before);
    expect(JSON.stringify(store.boardView())).not.toContain('forgeron');
  });

  it('change de carte et repart avec un brouillard vierge', () => {
    store.setFogEnabled(true);
    store.applyFog({ mode: 'reveal', shape: { kind: 'circle', cx: 5, cy: 5, r: 3 } });

    store.setMap('carte-1', { cols: 30, rows: 20, mapCellPx: 140 });

    expect(store.boardView().mapAssetId).toBe('carte-1');
    expect(store.grid()).toMatchObject({ cols: 30, rows: 20, mapCellPx: 140 });
    expect(store.fog()).toEqual({ enabled: true, ops: [] });
  });

  it('borne les réglages de grille invalides', () => {
    store.updateGrid({ cols: 0, rows: 999.6, mapCellPx: -5, offsetX: Number.NaN });
    expect(store.grid()).toEqual({ cols: 1, rows: 200, mapCellPx: 1, offsetX: 0, offsetY: 0 });
  });

  it('annule la dernière opération de brouillard', () => {
    store.applyFog({ mode: 'reveal', shape: { kind: 'circle', cx: 5, cy: 5, r: 3 } });
    store.applyFog({ mode: 'reveal', shape: { kind: 'rect', x: 0, y: 0, w: 2, h: 2 } });
    store.undoFog();
    expect(store.fog().ops).toHaveLength(1);
  });
});
