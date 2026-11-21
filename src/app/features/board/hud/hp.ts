import type { Player } from '../../../core/models/game-state.model';

/** Santé d'un joueur, pour la couleur de sa jauge (et son état, en science-fiction). */
export type HpLevel = 'high' | 'mid' | 'low' | 'down';

export function hpPercent({ hp, hpMax }: Pick<Player, 'hp' | 'hpMax'>): number {
  return hpMax > 0 ? Math.min(100, Math.max(0, (hp / hpMax) * 100)) : 0;
}

/** Plus de la moitié : `high` ; plus du quart : `mid` ; sinon `low` ; 0 PV : `down`. */
export function hpLevel(player: Pick<Player, 'hp' | 'hpMax'>): HpLevel {
  if (player.hp <= 0) return 'down';
  const percent = hpPercent(player);
  if (percent > 50) return 'high';
  if (percent > 25) return 'mid';
  return 'low';
}
