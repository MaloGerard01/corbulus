import type { FogBrushOp, FogFillOp, FogOp } from '../core/models/game-state.model';
import { brushStamps, planFogUpdate } from './fog-ops';

function stroke(id: string, points: [number, number][]): FogBrushOp {
  return { id, kind: 'brush', mode: 'hide', style: 'darkness', size: 2, fade: 0, points };
}

const cover: FogFillOp = { id: 'cover', kind: 'fill', mode: 'hide', style: 'fog' };

describe('planFogUpdate', () => {
  const a = stroke('a', [[0, 0], [1, 0]]);
  const b = stroke('b', [[5, 5]]);

  it("ne redessine rien si rien n'a changé, même après un clonage", () => {
    expect(planFogUpdate([a, cover], structuredClone([a, cover]))).toEqual({ kind: 'none' });
  });

  it('ne dessine que les opérations ajoutées', () => {
    expect(planFogUpdate([a], [a, cover, b])).toEqual({ kind: 'partial', op: 1, point: 0 });
  });

  it('ne dessine que la fin du tracé en cours', () => {
    const longer = stroke('a', [[0, 0], [1, 0], [2, 0], [3, 0]]);
    // Repart du dernier point déjà dessiné (indice 1).
    expect(planFogUpdate([a], [longer])).toEqual({ kind: 'partial', op: 0, point: 1 });
  });

  it('redessine tout après une annulation', () => {
    expect(planFogUpdate([a, b], [a])).toEqual({ kind: 'full' });
  });

  it("redessine tout en changeant de carte (d'autres opérations)", () => {
    const other: FogOp[] = [stroke('x', [[0, 0]]), stroke('y', [[1, 1]]), stroke('z', [[2, 2]])];
    expect(planFogUpdate([a, b], other)).toEqual({ kind: 'full' });
  });
});

describe('brushStamps', () => {
  /** Écart maximal entre deux empreintes successives d'un tracé horizontal. */
  function maxGap(stamps: [number, number][]): number {
    return Math.max(...stamps.slice(1).map(([x], i) => x - stamps[i][0]));
  }

  it('met une empreinte pour un simple clic', () => {
    expect(brushStamps({ size: 2, fade: 1, points: [[3, 4]] })).toEqual([[3, 4]]);
  });

  it('espace les empreintes de 15 % du diamètre au plus, du premier au dernier point', () => {
    // Bord net, diamètre 2 : une empreinte tous les 0,3 case au plus.
    const stamps = brushStamps({ size: 2, fade: 0, points: [[0, 0], [3, 0]] });

    expect(maxGap(stamps)).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(stamps[0]).toEqual([0, 0]);
    expect(stamps.at(-1)).toEqual([3, 0]);
  });

  it("garde le cœur continu même avec un fondu large", () => {
    // Cœur de 0,5 case dans un fondu de 2 cases : espacement réglé sur le cœur.
    const stamps = brushStamps({ size: 0.5, fade: 2, points: [[0, 0], [3, 0]] });
    expect(maxGap(stamps)).toBeLessThanOrEqual(0.125 + 1e-9);
  });

  it('dessine au fil du geste exactement les mêmes empreintes que d’un coup', () => {
    const points: [number, number][] = [[0, 0], [1.3, 0.4], [2.1, 2], [4, 2.5]];
    const whole = brushStamps({ size: 1.5, fade: 1, points });

    const firstPart = brushStamps({ size: 1.5, fade: 1, points: points.slice(0, 2) });
    const rest = brushStamps({ size: 1.5, fade: 1, points }, 1);

    expect([...firstPart, ...rest]).toEqual(whole);
  });
});
