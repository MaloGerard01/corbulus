import { HUD_MARGIN, hudRect, hudSize, snapToEdge, type ScreenRect } from './hud-geometry';

/** TV de 1600 × 900 px affichée à moitié de sa taille dans l'aperçu. */
const SCREEN: ScreenRect = { left: 0, top: 175, width: 800, height: 450, scale: 0.5 };
/** HUD sans portrait (avec son nom à l'envers), à moitié de sa taille sur la TV. */
const SIZE = hudSize({ portraitAssetId: null }, 'classic');
const LENGTH = SIZE.length * SCREEN.scale;
const DEPTH = SIZE.depth * SCREEN.scale;

describe('snapToEdge', () => {
  it('colle le HUD au bord le plus proche du pointeur', () => {
    expect(snapToEdge({ x: 400, y: 600 }, SCREEN, SIZE.length).seat).toBe('bottom');
    expect(snapToEdge({ x: 400, y: 200 }, SCREEN, SIZE.length).seat).toBe('top');
    expect(snapToEdge({ x: 20, y: 400 }, SCREEN, SIZE.length).seat).toBe('left');
    expect(snapToEdge({ x: 790, y: 400 }, SCREEN, SIZE.length).seat).toBe('right');
  });

  it('centre le HUD sur le pointeur le long du bord', () => {
    expect(snapToEdge({ x: 400, y: 600 }, SCREEN, SIZE.length).position).toBeCloseTo(0.5);
  });

  it('ne fait jamais dépasser le HUD des coins', () => {
    expect(snapToEdge({ x: 5, y: 620 }, SCREEN, SIZE.length)).toEqual({ seat: 'bottom', position: 0 });
    expect(snapToEdge({ x: 795, y: 180 }, SCREEN, SIZE.length)).toEqual({ seat: 'top', position: 1 });
  });
});

describe('hudRect', () => {
  const margin = HUD_MARGIN * SCREEN.scale;

  it('pose le HUD du bas contre le bord, à la position voulue', () => {
    expect(hudRect({ seat: 'bottom', position: 0.5 }, SCREEN, SIZE)).toEqual({
      left: margin + 0.5 * (800 - 2 * margin - LENGTH),
      top: 175 + 450 - margin - DEPTH,
      width: LENGTH,
      height: DEPTH,
    });
  });

  it('tourne le HUD des côtés gauche et droit : sa longueur suit le bord', () => {
    const left = hudRect({ seat: 'left', position: 0 }, SCREEN, SIZE);
    expect(left).toEqual({ left: margin, top: 175 + margin, width: DEPTH, height: LENGTH });

    const right = hudRect({ seat: 'right', position: 1 }, SCREEN, SIZE);
    expect(right).toEqual({
      left: 800 - margin - DEPTH,
      top: 175 + 450 - margin - LENGTH,
      width: DEPTH,
      height: LENGTH,
    });
  });

  it('agrandit le HUD de la bulle du portrait', () => {
    const withPortrait = hudSize({ portraitAssetId: 'portrait-1' }, 'classic');
    expect(withPortrait.length).toBeGreaterThan(SIZE.length);
    expect(withPortrait.depth).toBeGreaterThan(SIZE.depth);
  });

  it('suit le style des cartes : les cartes médiévales et SF sont plus grandes', () => {
    for (const theme of ['fantasy', 'scifi'] as const) {
      const size = hudSize({ portraitAssetId: null }, theme);
      expect(size.length).toBeGreaterThan(SIZE.length);
      expect(size.depth).toBeGreaterThan(SIZE.depth);
    }
  });
});
