import { sessionAssetIds } from './game-state.model';

describe('sessionAssetIds', () => {
  it('compte les cartes et les portraits des joueurs : aucun ne doit être nettoyé', () => {
    const map = { assetId: 'carte-1' } as never;
    const player = (portraitAssetId: string | null) => ({ portraitAssetId }) as never;

    expect(sessionAssetIds({ maps: [map], players: [player('portrait-1'), player(null)] })).toEqual([
      'carte-1',
      'portrait-1',
    ]);
  });
});
