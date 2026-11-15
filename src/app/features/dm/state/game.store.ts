import { Injectable, computed, signal } from '@angular/core';

import {
  SEATS,
  createInitialGameState,
  gridCenter,
  type Camera,
  type FogOp,
  type GameState,
  type GridConfig,
  type Player,
} from '../../../core/models/game-state.model';
import { sameBoardView, toBoardView } from './to-board-view';

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

/**
 * Source de vérité de la partie. Fourni uniquement par les routes MJ.
 * Toutes les mises à jour sont immuables : ne jamais muter l'état en place.
 */
@Injectable()
export class GameStore {
  private readonly _state = signal<GameState>(createInitialGameState());

  readonly state = this._state.asReadonly();
  readonly players = computed(() => this._state().players);
  readonly mapAssetId = computed(() => this._state().mapAssetId);
  readonly grid = computed(() => this._state().grid);
  readonly camera = computed(() => this._state().camera);
  readonly fog = computed(() => this._state().fog);
  readonly dmNotes = computed(() => this._state().dmNotes);
  readonly boardView = computed(() => toBoardView(this._state()), {
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

  // --- Carte et grille -----------------------------------------------------

  /**
   * Change de carte (ou la retire avec `null`). Les zones révélées de
   * l'ancienne carte n'ont plus de sens : le brouillard repart de zéro,
   * et la TV se recentre.
   */
  setMap(mapAssetId: string | null, grid?: Partial<GridConfig>): void {
    this.mutate((s) => {
      const nextGrid = grid ? normalizeGrid({ ...s.grid, ...grid }) : s.grid;
      return {
        ...s,
        mapAssetId,
        grid: nextGrid,
        camera: gridCenter(nextGrid),
        fog: { ...s.fog, ops: [] },
      };
    });
  }

  updateGrid(patch: Partial<GridConfig>): void {
    this.mutate((s) => ({ ...s, grid: normalizeGrid({ ...s.grid, ...patch }) }));
  }

  /** Déplace la zone affichée sur la TV. Le renderer la ramène de toute façon dans la grille. */
  setCamera(camera: Camera): void {
    this.mutate((s) => ({ ...s, camera }));
  }

  // --- Brouillard ----------------------------------------------------------

  setFogEnabled(enabled: boolean): void {
    this.mutate((s) => ({ ...s, fog: { ...s.fog, enabled } }));
  }

  applyFog(op: FogOp): void {
    this.mutate((s) => ({ ...s, fog: { ...s.fog, ops: [...s.fog.ops, op] } }));
  }

  undoFog(): void {
    this.mutate((s) => ({ ...s, fog: { ...s.fog, ops: s.fog.ops.slice(0, -1) } }));
  }

  // --- Divers --------------------------------------------------------------

  setDmNotes(dmNotes: string): void {
    this.mutate((s) => ({ ...s, dmNotes }));
  }

  load(state: GameState): void {
    this._state.set(state);
  }

  reset(): void {
    this._state.set(createInitialGameState());
  }

  // --- Interne -------------------------------------------------------------

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
