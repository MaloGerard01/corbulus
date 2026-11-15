import { fitGridToMap, gridSizeFromFileName, guessMapGrid } from './map-grid';

describe('gridSizeFromFileName', () => {
  it('lit le nombre de cases dans le nom du fichier', () => {
    expect(gridSizeFromFileName('taverne_30x20.jpg')).toEqual({ cols: 30, rows: 20 });
    expect(gridSizeFromFileName('[22 × 30] Crypte.png')).toEqual({ cols: 22, rows: 30 });
  });

  it('ignore les résolutions et les noms sans indication', () => {
    expect(gridSizeFromFileName('carte_1920x1080.jpg')).toBeNull();
    expect(gridSizeFromFileName('fond_640x480.png')).toBeNull();
    expect(gridSizeFromFileName('foret.webp')).toBeNull();
  });
});

describe('guessMapGrid', () => {
  const image = { width: 3000, height: 2000 };

  it("utilise l'indication du nom de fichier", () => {
    expect(guessMapGrid(image, 'taverne_30x20.jpg', 24)).toEqual({
      cols: 30,
      rows: 20,
      mapCellPx: 100,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("corrige une indication donnée dans l'autre sens", () => {
    expect(guessMapGrid(image, 'taverne_20x30.jpg', 24)).toMatchObject({ cols: 30, rows: 20 });
  });

  it('garde le nombre de colonnes actuel sans indication', () => {
    expect(guessMapGrid(image, 'taverne.jpg', 24)).toMatchObject({ cols: 24, rows: 16, mapCellPx: 125 });
  });
});

describe('fitGridToMap', () => {
  it('retire le décalage de la surface couverte', () => {
    expect(fitGridToMap({ width: 3000, height: 2000 }, 100, 0.5, 1)).toMatchObject({
      cols: 30,
      rows: 19,
    });
  });
});
