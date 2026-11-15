import type { FogBrushOp, FogOp } from '../core/models/game-state.model';

/**
 * Espacement entre deux empreintes : au plus un quart du cœur (qu'il reste
 * continu) et 15 % du diamètre total (que le fondu reste régulier).
 */
const CORE_SPACING = 0.25;
const TOTAL_SPACING = 0.15;
/** Espacement minimal, en cases (évite des milliers d'empreintes pour un petit pinceau). */
const MIN_STAMP_SPACING = 0.05;

/** Ce que le calque de brouillard doit redessiner pour passer de `drawn` à `next`. */
export type FogPlan =
  | { kind: 'none' }
  | { kind: 'full' }
  /** Dessiner `ops[op]` à partir de son point `point` (0 : en entier), puis toutes les suivantes. */
  | { kind: 'partial'; op: number; point: number };

/**
 * Compare les opérations déjà dessinées aux nouvelles, par identifiant :
 * côté plateau, l'état arrive cloné et les références changent à chaque
 * message. Les opérations ne changent que de trois façons : ajout, tracé en
 * cours qui s'allonge, retrait de la dernière (annulation). Tout le reste
 * (changement de carte…) se traduit par des identifiants différents.
 */
export function planFogUpdate(drawn: readonly FogOp[], next: readonly FogOp[]): FogPlan {
  if (next.length < drawn.length) return { kind: 'full' };

  for (let i = 0; i < drawn.length; i++) {
    const before = drawn[i];
    const after = next[i];
    if (before.id !== after.id) return { kind: 'full' };

    // Seul le dernier tracé dessiné a pu s'allonger depuis.
    if (i === drawn.length - 1 && before.kind === 'brush' && after.kind === 'brush') {
      const grown = after.points.length - before.points.length;
      if (grown < 0) return { kind: 'full' };
      if (grown > 0) return { kind: 'partial', op: i, point: before.points.length - 1 };
    }
  }

  return next.length > drawn.length
    ? { kind: 'partial', op: drawn.length, point: 0 }
    : { kind: 'none' };
}

/** Diamètre total d'une empreinte (cœur et fondu), en cases. */
export function brushDiameter(op: Pick<FogBrushOp, 'size' | 'fade'>): number {
  return op.size + 2 * op.fade;
}

/**
 * Centres des empreintes du pinceau, en cases, à partir du point `fromPoint`.
 *
 * Calculées segment par segment (chaque segment inclut son point d'arrivée,
 * pas son départ) : dessiner un tracé en une fois ou au fil du geste donne
 * exactement les mêmes empreintes.
 */
export function brushStamps(
  op: Pick<FogBrushOp, 'points' | 'size' | 'fade'>,
  fromPoint = 0,
): [number, number][] {
  const { points } = op;
  const spacing = Math.max(
    MIN_STAMP_SPACING,
    Math.min(op.size * CORE_SPACING, brushDiameter(op) * TOTAL_SPACING),
  );
  const stamps: [number, number][] = fromPoint === 0 && points.length > 0 ? [points[0]] : [];

  for (let i = Math.max(fromPoint, 0); i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      stamps.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
    }
  }
  return stamps;
}
