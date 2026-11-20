import { createInitialGameState, type GameState } from '../models/game-state.model';
import { restoreGameState, type SavedState } from './session-migration';

describe('restoreGameState', () => {
  it("convertit une sauvegarde à carte unique en session d'une carte affichée", () => {
    const legacy: SavedState = {
      revision: 42,
      mapAssetId: 'image-1',
      grid: { cols: 27, rows: 20, offsetX: 0, offsetY: 0 }, // sans mapCellPx
      camera: { x: 13.5, y: 6 }, // sans zoom
      fog: { enabled: true, ops: [] },
      players: [],
      dmNotes: 'Le traître est le forgeron',
    };

    const state = restoreGameState(legacy, 'foret_27x20');

    expect(state.maps).toHaveLength(1);
    expect(state.activeMapId).toBe(state.maps[0].id);
    expect(state.selectedMapId).toBe(state.maps[0].id);
    expect(state.maps[0]).toMatchObject({
      assetId: 'image-1',
      name: 'foret_27x20',
      kind: 'image',
      playback: null,
      grid: { cols: 27, rows: 20, mapCellPx: 100 },
      camera: { x: 13.5, y: 6, zoom: 1 },
      fog: { enabled: true, ops: [] },
    });
    expect(state).toMatchObject({ revision: 42, dmNotes: 'Le traître est le forgeron' });
    expect(state).not.toHaveProperty('mapAssetId');
    expect(state).not.toHaveProperty('grid');
  });

  it("écarte les opérations de brouillard d'avant le pinceau", () => {
    const fill = { id: 'op-1', kind: 'fill', mode: 'hide', style: 'fog' } as const;
    const state = restoreGameState(
      {
        mapAssetId: 'image-1',
        fog: { enabled: true, ops: [{ mode: 'reveal', shape: { kind: 'circle', cx: 1, cy: 1, r: 2 } }, fill] },
      },
      null,
    );
    expect(state.maps[0].fog.ops).toEqual([fill]);
  });

  it("donne le fondu par défaut aux tracés d'avant ce réglage", () => {
    const stroke = { id: 'op-1', kind: 'brush', mode: 'hide', style: 'fog', size: 2, points: [[1, 1]] };
    const withSoftness = { ...stroke, softness: 0.8 };
    const state = restoreGameState(
      { mapAssetId: 'image-1', fog: { enabled: true, ops: [stroke, { ...withSoftness, id: 'op-2' }] } },
      null,
    );
    expect(state.maps[0].fog.ops).toEqual([
      { ...stroke, fade: 2 },
      { ...stroke, id: 'op-2', fade: 2 },
    ]);
  });

  it("donne le volume maximal aux vidéos d'avant ce réglage", () => {
    const playback = { playing: false, loop: true, muted: false, position: 12, at: 5 };
    const state = restoreGameState(
      {
        maps: [
          {
            id: 'carte-1',
            assetId: 'video-1',
            name: 'Cascade',
            kind: 'video',
            playback: playback as never,
          },
        ],
      },
      null,
    );
    expect(state.maps[0].playback).toEqual({ ...playback, volume: 1 });
  });

  it("donne une session sans carte à une ancienne sauvegarde qui n'en avait pas", () => {
    const state = restoreGameState({ mapAssetId: null, players: [] }, null);
    expect(state.maps).toEqual([]);
    expect(state.activeMapId).toBeNull();
  });

  it('reprend une sauvegarde à jour telle quelle', () => {
    const current: GameState = {
      ...createInitialGameState(),
      maps: [
        {
          id: 'carte-1',
          assetId: 'image-1',
          name: 'Taverne',
          kind: 'image',
          playback: null,
          grid: { cols: 30, rows: 20, mapCellPx: 140, offsetX: 0, offsetY: 0 },
          camera: { x: 4, y: 5, zoom: 2 },
          fog: { enabled: false, ops: [] },
        },
      ],
      activeMapId: null,
      preciseView: true,
    };

    expect(restoreGameState(current, null)).toEqual(current);
  });
});
