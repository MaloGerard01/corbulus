import { Injectable, computed, signal } from '@angular/core';

import {
  BLANK_MAP,
  DEFAULT_GRID,
  SEATS,
  centeredCamera,
  createInitialGameState,
  findMap,
  type Camera,
  type FogBrushOp,
  type FogOp,
  type FogStyle,
  type GameState,
  type GridConfig,
  type Player,
  type SessionMap,
} from '../../../core/models/game-state.model';
import { mapView, sameBoardView, toBoardView } from './to-board-view';

const PLAYER_COLORS = [
  '#e6194b',
  '#3cb44b',
  '#4363d8',
  '#f58231',
  '#911eb4',
  '#42d4f4',
  '#f032e6',
  '#bfef45',
];

/** Au-delà, la grille n'a plus de sens sur une TV (et coûte cher à dessiner). */
const MAX_GRID_SIZE = 200;

export type PlayerPatch = Partial<Omit<Player, 'id'>>;

export interface NewMap {
  assetId: string;
  name: string;
  grid?: Partial<GridConfig>;
}

/** Début d'un coup de pinceau : son premier point, en cases. */
export type NewFogStroke = Pick<FogBrushOp, 'mode' | 'style' | 'size' | 'fade'> & {
  point: [number, number];
};

/**
 * Source de vérité de la partie. Fourni uniquement par les routes MJ.
 * Toutes les mises à jour sont immuables : ne jamais muter l'état en place.
 */
@Injectable()
export class GameStore {
  private readonly _state = signal<GameState>(createInitialGameState());

  readonly state = this._state.asReadonly();
  readonly players = computed(() => this._state().players);
  readonly maps = computed(() => this._state().maps);
  /** Carte affichée sur la TV, `null` pour la grille vierge. */
  readonly activeMap = computed(() => findMap(this._state(), this._state().activeMapId));
  /** Carte en cours d'édition dans la vue MJ, affichée ou non. */
  readonly selectedMap = computed(() => findMap(this._state(), this._state().selectedMapId));
  // Grille, vue et brouillard de la carte en édition (ceux de la grille vierge sinon).
  readonly grid = computed(() => this.selectedMap()?.grid ?? BLANK_MAP.grid);
  readonly camera = computed(() => this.selectedMap()?.camera ?? BLANK_MAP.camera);
  readonly fog = computed(() => this.selectedMap()?.fog ?? BLANK_MAP.fog);
  readonly preciseView = computed(() => this._state().preciseView);
  readonly dmNotes = computed(() => this._state().dmNotes);
  /** Ce que reçoit le plateau : la carte affichée. */
  readonly boardView = computed(() => toBoardView(this._state()), {
    equal: sameBoardView,
  });
  /** Ce que montre l'aperçu MJ : la carte en édition, même si elle n'est pas affichée. */
  readonly selectedView = computed(() => mapView(this.selectedMap(), this.players()), {
    equal: sameBoardView,
  });

  // --- Joueurs -------------------------------------------------------------

  addPlayer(): void {
    this.mutate((s) => {
      const index = s.players.length;
      const player: Player = {
        id: crypto.randomUUID(),
        name: `Joueur ${index + 1}`,
        color: PLAYER_COLORS[index % PLAYER_COLORS.length],
        seat: SEATS[index % SEATS.length],
        hp: 10,
        hpMax: 10,
        gold: 0,
      };
      return { ...s, players: [...s.players, player] };
    });
  }

  updatePlayer(id: string, patch: PlayerPatch): void {
    this.mutatePlayer(id, (p) => ({ ...p, ...patch }));
  }

  adjustHp(id: string, delta: number): void {
    this.mutatePlayer(id, (p) => ({ ...p, hp: p.hp + delta }));
  }

  adjustGold(id: string, delta: number): void {
    this.mutatePlayer(id, (p) => ({ ...p, gold: p.gold + delta }));
  }

  removePlayer(id: string): void {
    this.mutate((s) => ({ ...s, players: s.players.filter((p) => p.id !== id) }));
  }

  // --- Cartes de la session ------------------------------------------------

  /**
   * Ajoute une carte à la session et la sélectionne pour l'éditer. Elle n'est
   * pas affichée sur la TV : importer ne doit pas dévoiler une carte aux joueurs.
   */
  addMap({ assetId, name, grid }: NewMap): SessionMap {
    const nextGrid = normalizeGrid({ ...DEFAULT_GRID, ...grid });
    const map: SessionMap = {
      id: crypto.randomUUID(),
      assetId,
      name,
      grid: nextGrid,
      camera: centeredCamera(nextGrid),
      // Actif mais vide : rien n'est caché tant que le MJ n'a pas peint.
      fog: { enabled: true, ops: [] },
    };
    this.mutate((s) => ({
      ...s,
      maps: [...s.maps, map],
      selectedMapId: map.id,
    }));
    return map;
  }

  /**
   * Sélectionne une carte pour l'éditer, sans toucher à la TV. Si sa vue
   * était zoomée, le mode « Précis » se réactive pour qu'on puisse la régler.
   */
  selectMap(id: string | null): void {
    this.mutate((s) => {
      const map = findMap(s, id);
      return {
        ...s,
        selectedMapId: map?.id ?? null,
        preciseView: s.preciseView || (map !== null && map.camera.zoom !== 1),
      };
    });
  }

  /** Affiche une carte sur la TV (`null` : grille vierge), telle qu'on l'a préparée. */
  activateMap(id: string | null): void {
    this.mutate((s) => ({ ...s, activeMapId: findMap(s, id)?.id ?? null }));
  }

  /**
   * Retire une carte. Si elle était affichée, la TV passe à la grille vierge ;
   * si elle était en édition, on passe à celle qui est affichée.
   */
  removeMap(id: string): void {
    this.mutate((s) => {
      const activeMapId = s.activeMapId === id ? null : s.activeMapId;
      return {
        ...s,
        maps: s.maps.filter((m) => m.id !== id),
        activeMapId,
        selectedMapId: s.selectedMapId === id ? activeMapId : s.selectedMapId,
      };
    });
  }

  // --- Carte en édition : grille et vue ------------------------------------

  updateGrid(patch: Partial<GridConfig>): void {
    this.mutateSelectedMap((m) => ({ ...m, grid: normalizeGrid({ ...m.grid, ...patch }) }));
  }

  /**
   * Déplace la zone que la TV montre de cette carte (tout de suite si elle
   * est affichée). Le renderer la ramène de toute façon dans la grille.
   */
  setCamera(camera: Camera): void {
    this.mutateSelectedMap((m) => ({ ...m, camera }));
  }

  /** Quitter le mode « Précis » ramène la carte en édition à sa vue entière (zoom 1). */
  setPreciseView(preciseView: boolean): void {
    this.mutate((s) => ({
      ...s,
      preciseView,
      maps: s.maps.map((m) =>
        m.id === s.selectedMapId && !preciseView && m.camera.zoom !== 1
          ? { ...m, camera: { ...m.camera, zoom: 1 } }
          : m,
      ),
    }));
  }

  // --- Carte en édition : brouillard ---------------------------------------

  /** Affiche ou masque le brouillard peint, sans le perdre. */
  setFogEnabled(enabled: boolean): void {
    this.mutateSelectedMap((m) => ({ ...m, fog: { ...m.fog, enabled } }));
  }

  /** Ajoute une opération ; peindre rend le brouillard visible s'il était masqué. */
  applyFog(op: FogOp): void {
    this.mutateSelectedMap((m) => ({ ...m, fog: { enabled: true, ops: [...m.fog.ops, op] } }));
  }

  /**
   * Commence un coup de pinceau sur la carte en édition. Renvoie son id pour
   * l'allonger au fil du geste (`null` sans carte en édition).
   */
  beginFogStroke({ point, ...stroke }: NewFogStroke): string | null {
    if (!this.selectedMap()) return null;
    const id = crypto.randomUUID();
    this.applyFog({ id, kind: 'brush', ...stroke, points: [point] });
    return id;
  }

  /** Allonge le coup de pinceau en cours, s'il est toujours le dernier tracé. */
  extendFogStroke(id: string, point: [number, number]): void {
    const last = this.selectedMap()?.fog.ops.at(-1);
    if (last?.id !== id || last.kind !== 'brush') return;
    this.mutateSelectedMap((m) => ({
      ...m,
      fog: {
        ...m.fog,
        ops: [...m.fog.ops.slice(0, -1), { ...last, points: [...last.points, point] }],
      },
    }));
  }

  /** Couvre (`hide`) ou dévoile (`reveal`) toute la carte en édition. Annulable. */
  fillFog(mode: 'hide' | 'reveal', style: FogStyle): void {
    this.applyFog({ id: crypto.randomUUID(), kind: 'fill', mode, style });
  }

  /** Retire la dernière opération (un coup de pinceau entier). */
  undoFog(): void {
    this.mutateSelectedMap((m) => ({ ...m, fog: { ...m.fog, ops: m.fog.ops.slice(0, -1) } }));
  }

  // --- Divers --------------------------------------------------------------

  setDmNotes(dmNotes: string): void {
    this.mutate((s) => ({ ...s, dmNotes }));
  }

  load(state: GameState): void {
    this._state.set(state);
  }

  // --- Interne -------------------------------------------------------------

  /** Sans carte en édition, il n'y a rien à modifier. */
  private mutateSelectedMap(fn: (m: SessionMap) => SessionMap): void {
    if (!this.selectedMap()) return;
    this.mutate((s) => ({
      ...s,
      maps: s.maps.map((m) => (m.id === s.selectedMapId ? fn(m) : m)),
    }));
  }

  private mutatePlayer(id: string, fn: (p: Player) => Player): void {
    this.mutate((s) => ({
      ...s,
      players: s.players.map((p) => (p.id === id ? normalizePlayer(fn(p)) : p)),
    }));
  }

  private mutate(fn: (s: GameState) => GameState): void {
    this._state.update((s) => ({ ...fn(s), revision: s.revision + 1 }));
  }
}

function normalizePlayer(p: Player): Player {
  const hpMax = Math.max(1, Math.round(p.hpMax) || 1);
  return {
    ...p,
    hpMax,
    hp: clamp(Math.round(p.hp) || 0, 0, hpMax),
    gold: Math.max(0, Math.round(p.gold) || 0),
  };
}

function normalizeGrid(g: GridConfig): GridConfig {
  return {
    cols: clamp(Math.round(g.cols) || 1, 1, MAX_GRID_SIZE),
    rows: clamp(Math.round(g.rows) || 1, 1, MAX_GRID_SIZE),
    mapCellPx: g.mapCellPx >= 1 ? g.mapCellPx : 1,
    offsetX: Number.isFinite(g.offsetX) ? g.offsetX : 0,
    offsetY: Number.isFinite(g.offsetY) ? g.offsetY : 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
