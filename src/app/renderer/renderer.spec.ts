import type { FogOp } from '../core/models/game-state.model';
import { firstNewFogOp, fogOpKey } from './fog-ops';
import { computeLayout } from './layout';

describe('computeLayout', () => {
  it('ajuste la grille sur la largeur et la centre verticalement', () => {
    const layout = computeLayout(1000, 1000, { cols: 10, rows: 5 });
    expect(layout).toEqual({ cellPx: 100, originX: 0, originY: 250 });
  });

  it('ajuste la grille sur la hauteur et la centre horizontalement', () => {
    const layout = computeLayout(1920, 1080, { cols: 10, rows: 10 });
    expect(layout).toEqual({ cellPx: 108, originX: 420, originY: 0 });
  });

  it('ne produit pas de taille négative pour un canvas vide', () => {
    expect(computeLayout(0, 0, { cols: 10, rows: 10 }).cellPx).toBe(0);
  });
});

describe('firstNewFogOp', () => {
  const reveal: FogOp = { mode: 'reveal', shape: { kind: 'circle', cx: 5, cy: 5, r: 3 } };
  const hide: FogOp = { mode: 'hide', shape: { kind: 'rect', x: 0, y: 0, w: 2, h: 2 } };
  const keys = (ops: FogOp[]) => ops.map(fogOpKey);

  it("ne dessine que les opérations ajoutées", () => {
    expect(firstNewFogOp(keys([reveal]), keys([reveal, hide]))).toBe(1);
  });

  it("n'a rien à dessiner si rien n'a changé, même après un clonage", () => {
    const cloned = structuredClone([reveal, hide]);
    expect(firstNewFogOp(keys([reveal, hide]), keys(cloned))).toBe(2);
  });

  it('redessine tout après une annulation', () => {
    expect(firstNewFogOp(keys([reveal, hide]), keys([reveal]))).toBeNull();
  });

  it('redessine tout si une opération a été remplacée', () => {
    expect(firstNewFogOp(keys([reveal, hide]), keys([reveal, reveal]))).toBeNull();
  });
});
