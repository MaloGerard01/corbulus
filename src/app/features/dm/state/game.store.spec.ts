import { TestBed } from '@angular/core/testing';

import type { FogOp } from '../../../core/models/game-state.model';
import { GameStore } from './game.store';

const reveal: FogOp = {
  id: 'trace-1',
  kind: 'brush',
  mode: 'reveal',
  style: 'darkness',
  size: 3,
  fade: 2,
  points: [[5, 5]],
};

describe('GameStore', () => {
  let store: GameStore;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [GameStore] });
    store = TestBed.inject(GameStore);
  });

  it('ajoute un joueur avec des valeurs par défaut', () => {
    store.addPlayer();
    expect(store.players()).toHaveLength(1);
    expect(store.players()[0]).toMatchObject({ hp: 10, seatPosition: null, portraitAssetId: null });
  });

  it('borne la position personnalisée des infos entre 0 et 1', () => {
    store.addPlayer();
    const id = store.players()[0].id;

    store.updatePlayer(id, { seat: 'left', seatPosition: 1.4 });
    expect(store.players()[0]).toMatchObject({ seat: 'left', seatPosition: 1 });

    store.updatePlayer(id, { seatPosition: Number.NaN });
    expect(store.players()[0].seatPosition).toBeNull();
  });

  it('borne les PV entre 0 et le max', () => {
    store.addPlayer();
    const id = store.players()[0].id;

    store.adjustHp(id, -50);
    expect(store.players()[0].hp).toBe(0);

    store.adjustHp(id, 50);
    expect(store.players()[0].hp).toBe(10);
  });

  it('envoie le style des cartes choisi au plateau', () => {
    expect(store.boardView().hudTheme).toBe('classic');

    store.setHudTheme('scifi');

    expect(store.hudTheme()).toBe('scifi');
    expect(store.boardView().hudTheme).toBe('scifi');
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
      // Nouvelle carte : brouillard actif mais vide, rien n'est caché.
      expect(store.fog()).toEqual({ enabled: true, ops: [] });
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

  describe('cartes animées', () => {
    it('envoie au plateau la vidéo affichée, en plein écran, sans grille ni brouillard', () => {
      const video = store.addMap({ assetId: 'video-1', name: 'Cascade', kind: 'video' });
      store.activateMap(video.id);

      expect(store.boardView()).toMatchObject({
        mapAssetId: null,
        fog: { enabled: false },
        animated: { kind: 'video', assetId: 'video-1', playback: { playing: true, muted: true } },
      });
    });

    it('commande la lecture de la vidéo en édition, et seulement d’une vidéo', () => {
      store.addMap({ assetId: 'video-1', name: 'Cascade', kind: 'video' });
      const playback = store.selectedMap()!.playback!;
      store.setPlayback({ ...playback, muted: false });
      expect(store.selectedMap()?.playback?.muted).toBe(false);

      store.addMap({ assetId: 'image-1', name: 'Taverne' });
      store.setPlayback({ ...playback, playing: false });
      expect(store.selectedMap()?.playback).toBeNull();
    });

    it('ne renvoie rien au plateau tant que la lecture ne change pas', () => {
      const gif = store.addMap({ assetId: 'gif-1', name: 'Feu', kind: 'gif' });
      store.activateMap(gif.id);
      const before = store.boardView();

      store.setDmNotes('Le feu cache un passage');

      expect(store.boardView()).toBe(before);
    });
  });

  describe('brouillard', () => {
    beforeEach(() => store.addMap({ assetId: 'image-1', name: 'Taverne' }));

    it('trace un coup de pinceau qui s’allonge au fil du geste', () => {
      const id = store.beginFogStroke({ mode: 'hide', style: 'fog', size: 2, fade: 1, point: [1, 1] });
      store.extendFogStroke(id!, [2, 1]);
      store.extendFogStroke(id!, [3, 2]);

      expect(store.fog().ops).toEqual([
        { id, kind: 'brush', mode: 'hide', style: 'fog', size: 2, fade: 1, points: [[1, 1], [2, 1], [3, 2]] },
      ]);
    });

    it("n'allonge plus un tracé annulé ou terminé par un autre", () => {
      const first = store.beginFogStroke({ mode: 'hide', style: 'darkness', size: 2, fade: 1, point: [0, 0] });
      store.beginFogStroke({ mode: 'reveal', style: 'darkness', size: 2, fade: 1, point: [5, 5] });

      store.extendFogStroke(first!, [1, 0]);

      expect(store.fog().ops.map((op) => (op.kind === 'brush' ? op.points.length : 0))).toEqual([1, 1]);
    });

    it('peindre rend le brouillard visible s’il était masqué', () => {
      store.setFogEnabled(false);
      store.beginFogStroke({ mode: 'hide', style: 'darkness', size: 2, fade: 1, point: [0, 0] });
      expect(store.fog().enabled).toBe(true);
    });

    it('couvre et dévoile toute la carte, de façon annulable', () => {
      store.fillFog('hide', 'fog');
      store.fillFog('reveal', 'fog');

      expect(store.fog().ops).toMatchObject([
        { kind: 'fill', mode: 'hide', style: 'fog' },
        { kind: 'fill', mode: 'reveal' },
      ]);
      store.undoFog();
      expect(store.fog().ops).toHaveLength(1);
    });

    it('annule un coup de pinceau entier', () => {
      store.applyFog(reveal);
      const id = store.beginFogStroke({ mode: 'hide', style: 'darkness', size: 2, fade: 1, point: [0, 0] });
      store.extendFogStroke(id!, [4, 4]);

      store.undoFog();

      expect(store.fog().ops).toEqual([reveal]);
    });
  });
});
