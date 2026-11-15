import {
  DEFAULT_FOG_FADE,
  DEFAULT_GRID,
  centeredCamera,
  createInitialGameState,
  type Camera,
  type FogBrushOp,
  type FogOp,
  type GameState,
  type GridConfig,
  type SessionMap,
} from '../models/game-state.model';

/** Brouillard sauvegardé : peut contenir des opérations d'un ancien format. */
interface SavedFog {
  enabled: boolean;
  ops: unknown[];
}

/** Carte telle que sauvegardée, éventuellement avant l'ajout de certains champs. */
type SavedMap = Omit<SessionMap, 'grid' | 'camera' | 'fog'> & {
  grid?: Partial<GridConfig>;
  camera?: Partial<Camera>;
  fog?: SavedFog;
};

/** Sauvegarde antérieure aux cartes multiples : une seule carte, au niveau de l'état. */
interface LegacySingleMap {
  mapAssetId?: string | null;
  grid?: Partial<GridConfig>;
  camera?: Partial<Camera>;
  fog?: SavedFog;
}

export type SavedState = Partial<Omit<GameState, 'maps'>> & { maps?: SavedMap[] } & LegacySingleMap;

/**
 * Remet en forme une sauvegarde, quelle que soit sa version : les champs
 * ajoutés depuis prennent leur valeur par défaut, et l'ancienne carte unique
 * devient la carte (affichée) de la session.
 *
 * @param legacyMapName nom de l'ancienne carte unique, lu dans les assets
 */
export function restoreGameState(saved: SavedState, legacyMapName: string | null): GameState {
  const initial = createInitialGameState();
  const maps = (saved.maps ?? legacyMaps(saved, legacyMapName)).map(normalizeMap);
  const activeMapId = saved.maps ? (saved.activeMapId ?? null) : (maps[0]?.id ?? null);
  return {
    revision: saved.revision ?? initial.revision,
    maps,
    activeMapId,
    // Avant la sélection séparée, on éditait la carte affichée.
    selectedMapId: saved.selectedMapId !== undefined ? saved.selectedMapId : activeMapId,
    preciseView: saved.preciseView ?? initial.preciseView,
    players: saved.players ?? initial.players,
    dmNotes: saved.dmNotes ?? initial.dmNotes,
  };
}

function legacyMaps(saved: LegacySingleMap, name: string | null): SavedMap[] {
  if (!saved.mapAssetId) return [];
  return [
    {
      id: crypto.randomUUID(),
      assetId: saved.mapAssetId,
      name: name ?? 'Carte',
      grid: saved.grid,
      camera: saved.camera,
      fog: saved.fog,
    },
  ];
}

function normalizeMap(map: SavedMap): SessionMap {
  const grid = { ...DEFAULT_GRID, ...map.grid };
  return {
    ...map,
    grid,
    camera: { ...centeredCamera(grid), ...map.camera },
    fog: {
      enabled: map.fog?.enabled ?? true,
      ops: (map.fog?.ops ?? []).filter(isFogOp).map(normalizeFogOp),
    },
  };
}

/**
 * Les tracés d'avant le fondu en cases (sans fondu, ou avec l'ancienne
 * « douceur » relative) prennent le fondu par défaut.
 */
function normalizeFogOp(op: FogOp): FogOp {
  if (op.kind !== 'brush' || typeof op.fade === 'number') return op;
  const { softness: _softness, ...stroke } = op as FogBrushOp & { softness?: number };
  return { ...stroke, fade: DEFAULT_FOG_FADE };
}

/**
 * Les opérations par forme (cercle, rectangle…) d'avant le pinceau ne sont
 * plus dessinées : aucun outil n'en créait, on les écarte.
 */
function isFogOp(op: unknown): op is FogOp {
  if (typeof op !== 'object' || op === null) return false;
  const { id, kind, points } = op as Partial<Record<string, unknown>>;
  return typeof id === 'string' && (kind === 'fill' || (kind === 'brush' && Array.isArray(points)));
}
