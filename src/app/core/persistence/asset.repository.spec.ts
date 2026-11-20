import { mediaKind } from './asset.repository';

describe('mediaKind', () => {
  it('reconnaît le type du fichier', () => {
    expect(mediaKind(new Blob([], { type: 'image/png' }), 'taverne.png')).toBe('image');
    expect(mediaKind(new Blob([], { type: 'image/gif' }), 'feu.gif')).toBe('gif');
    expect(mediaKind(new Blob([], { type: 'video/webm' }), 'cascade.webm')).toBe('video');
  });

  it("se rabat sur l'extension quand le système ne donne pas le type", () => {
    expect(mediaKind(new Blob([]), 'cascade.MP4')).toBe('video');
    expect(mediaKind(new Blob([]), 'feu.gif')).toBe('gif');
  });
});
