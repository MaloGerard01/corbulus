import { TestBed } from '@angular/core/testing';

import type { FogOp } from '../../../core/models/game-state.model';
import { GameStore } from './game.store';

const reveal: FogOp = { mode: 'reveal', shape: { kind: 'circle', cx: 5, cy: 5, r: 3 } };

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

  it('ne change pas la vue plateau quand seules les notes changent', () => {
    store.addPlayer();
    const before = store.boardView();

    store.setDmNotes('Le traître est le forgeron');

    expect(store.boardView()).toBe(before);
    expect(JSON.stringify(store.boardView())).not.toContain('forgeron');
  });

  describe('cartes de la session', () => {
    it("sélectionne la carte importée pour l'éditer, sans l'afficher", () => {
      store.addMap({ assetId: 'image-1', name: 'Taverne' });
      const crypte = store.addMap({ assetId: 'image-2', name: 'Crypte', grid: { cols: 30, rows: 20 } });

      expect(store.maps()).toHaveLength(2);
      expect(store.selectedMap()?.id).toBe(crypte.id);
      expect(store.activeMap()).toBeNull();
      expect(store.boardView().mapAssetId).toBeNull();
      expect(store.selectedView()).toMatchObject({
        mapAssetId: 'image-2',
        grid: { cols: 30, rows: 20 },
        camera: { x: 15, y: 10, zoom: 1 },
      });
    });

    it("prépare une carte sans rien envoyer au plateau, puis l'affiche telle quelle", () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.activateMap(taverne.id);
      const crypte = store.addMap({ assetId: 'image-2', name: 'Crypte' });
      const onScreen = store.boardView();

      store.updateGrid({ cols: 30, rows: 20 });
      store.setCamera({ x: 4, y: 6, zoom: 2 });
      store.setFogEnabled(true);
      store.applyFog(reveal);
      expect(store.boardView()).toBe(onScreen);

      store.activateMap(crypte.id);
      expect(store.boardView()).toMatchObject({
        mapAssetId: 'image-2',
        grid: { cols: 30, rows: 20 },
        camera: { x: 4, y: 6, zoom: 2 },
        fog: { enabled: true, ops: [reveal] },
      });
    });

    it('retrouve la vue et le brouillard de chaque carte en passant de l’une à l’autre', () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.setCamera({ x: 3, y: 4, zoom: 1 });
      store.setFogEnabled(true);
      store.applyFog(reveal);
      store.addMap({ assetId: 'image-2', name: 'Crypte' });
      expect(store.fog()).toEqual({ enabled: false, ops: [] });
      store.setCamera({ x: 8, y: 2, zoom: 1 });

      store.selectMap(taverne.id);
      expect(store.camera()).toEqual({ x: 3, y: 4, zoom: 1 });
      expect(store.fog()).toEqual({ enabled: true, ops: [reveal] });
      expect(store.maps()[1].camera).toEqual({ x: 8, y: 2, zoom: 1 });
    });

    it("n'envoie au plateau que la carte affichée", () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.activateMap(taverne.id);
      store.addMap({ assetId: 'secret', name: 'Antre du dragon' });

      const sent = JSON.stringify(store.boardView());
      expect(sent).toContain('image-1');
      expect(sent).not.toContain('secret');
      expect(sent).not.toContain('Antre du dragon');
    });

    it('retirer la carte affichée laisse la TV sur une grille vierge', () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.activateMap(taverne.id);
      const crypte = store.addMap({ assetId: 'image-2', name: 'Crypte' });

      store.removeMap(taverne.id);

      expect(store.maps().map((m) => m.name)).toEqual(['Crypte']);
      expect(store.activeMap()).toBeNull();
      expect(store.selectedMap()?.id).toBe(crypte.id);
      expect(store.boardView()).toMatchObject({ mapAssetId: null, fog: { enabled: false } });
    });

    it('retirer la carte en édition passe à celle qui est affichée', () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.activateMap(taverne.id);
      const crypte = store.addMap({ assetId: 'image-2', name: 'Crypte' });

      store.removeMap(crypte.id);

      expect(store.selectedMap()?.id).toBe(taverne.id);
    });

    it('ne modifie rien sans carte en édition', () => {
      const before = store.state();
      store.setCamera({ x: 1, y: 1, zoom: 2 });
      store.applyFog(reveal);
      store.updateGrid({ cols: 5 });
      expect(store.state()).toBe(before);
    });

    it('réactive le mode précis en revenant sur une carte zoomée', () => {
      const taverne = store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.setPreciseView(true);
      store.setCamera({ x: 5, y: 5, zoom: 2 });
      store.selectMap(null);
      store.setPreciseView(false);

      store.selectMap(taverne.id);

      expect(store.preciseView()).toBe(true);
      expect(store.camera().zoom).toBe(2);
    });
  });

  it('le mode précis reste côté MJ, et le quitter ramène la carte entière', () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    const before = store.boardView();
    store.setPreciseView(true);
    expect(store.boardView()).toBe(before);
    expect(store.boardView()).not.toHaveProperty('preciseView');

    store.setCamera({ x: 5, y: 5, zoom: 3 });
    store.setPreciseView(false);

    expect(store.preciseView()).toBe(false);
    expect(store.camera()).toEqual({ x: 5, y: 5, zoom: 1 });
  });

  it('borne les réglages de grille invalides', () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    store.updateGrid({ cols: 0, rows: 999.6, mapCellPx: -5, offsetX: Number.NaN });
    expect(store.grid()).toEqual({ cols: 1, rows: 200, mapCellPx: 1, offsetX: 0, offsetY: 0 });
  });

  it('annule la dernière opération de brouillard', () => {
    store.addMap({ assetId: 'image-1', name: 'Taverne' });
    store.applyFog(reveal);
    store.applyFog({ mode: 'reveal', shape: { kind: 'rect', x: 0, y: 0, w: 2, h: 2 } });
    store.undoFog();
    expect(store.fog().ops).toEqual([reveal]);
  });
});
