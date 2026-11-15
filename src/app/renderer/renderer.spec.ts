import { computeLayout, visibleCells } from './layout';

describe('computeLayout', () => {
  const anywhere = { x: 0, y: 0, zoom: 1 };

  it('contain : ajuste la grille sur la largeur et la centre verticalement', () => {
    const layout = computeLayout(1000, 1000, { cols: 10, rows: 5 }, anywhere, 'contain');
    expect(layout).toMatchObject({ cellPx: 100, originX: 0, originY: 250 });
  });

  it('contain : ajuste la grille sur la hauteur et la centre horizontalement', () => {
    const layout = computeLayout(1920, 1080, { cols: 10, rows: 10 }, anywhere, 'contain');
    expect(layout).toMatchObject({ cellPx: 108, originX: 420, originY: 0 });
  });

  it("cover : la grille couvre tout l'écran, centrée sur la caméra", () => {
    // Écran 2:1, grille carrée : la moitié des rangées dépasse.
    const layout = computeLayout(2000, 1000, { cols: 20, rows: 20 }, { x: 10, y: 10, zoom: 1 }, 'cover');
    expect(layout).toEqual({ cellPx: 100, originX: 0, originY: -500, camera: { x: 10, y: 10, zoom: 1 } });
  });

  it("cover : la caméra est ramenée pour que l'écran ne sorte pas de la grille", () => {
    const grid = { cols: 20, rows: 20 };
    expect(computeLayout(2000, 1000, grid, { x: 3, y: 2, zoom: 1 }, 'cover')).toMatchObject({
      originY: 0,
      camera: { x: 10, y: 5 },
    });
    expect(computeLayout(2000, 1000, grid, { x: 10, y: 99, zoom: 1 }, 'cover')).toMatchObject({
      originY: -1000,
      camera: { x: 10, y: 15 },
    });
  });

  it('cover : le zoom agrandit les cases et reste borné à la grille', () => {
    // Zoom 2 : 10 × 5 cases visibles ; x = 4 est ramené à 5 pour ne pas sortir à gauche.
    const layout = computeLayout(2000, 1000, { cols: 20, rows: 20 }, { x: 4, y: 4, zoom: 2 }, 'cover');
    expect(layout).toEqual({ cellPx: 200, originX: 0, originY: -300, camera: { x: 5, y: 4, zoom: 2 } });
  });

  it('contain : ignore le zoom, toute la grille reste visible', () => {
    const layout = computeLayout(1000, 1000, { cols: 10, rows: 5 }, { x: 0, y: 0, zoom: 3 }, 'contain');
    expect(layout.cellPx).toBe(100);
  });

  it('ne produit pas de taille négative pour un canvas vide', () => {
    expect(computeLayout(0, 0, { cols: 10, rows: 10 }, anywhere, 'contain').cellPx).toBe(0);
  });
});

describe('visibleCells', () => {
  it('donne la partie de la grille affichée en mode cover', () => {
    const rect = visibleCells(2000, 1000, { cols: 20, rows: 20 }, { x: 10, y: 12, zoom: 1 }, 'cover');
    expect(rect).toEqual({ x: 0, y: 7, w: 20, h: 10 });
  });

  it('rétrécit avec le zoom', () => {
    const rect = visibleCells(2000, 1000, { cols: 20, rows: 20 }, { x: 10, y: 10, zoom: 2 }, 'cover');
    expect(rect).toEqual({ x: 5, y: 7.5, w: 10, h: 5 });
  });

  it('se limite à la grille quand elle tient en entier', () => {
    const rect = visibleCells(1000, 1000, { cols: 10, rows: 5 }, { x: 0, y: 0, zoom: 1 }, 'contain');
    expect(rect).toEqual({ x: 0, y: 0, w: 10, h: 5 });
  });
});
