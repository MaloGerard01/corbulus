import { Texture } from 'pixi.js';

/**
 * Texture Pixi à partir de pixels RGBA calculés (voir fog-textures.ts,
 * explosion-textures.ts). Hors du cache de Pixi : elle appartient au calque
 * qui la crée, qui doit la détruire avec lui.
 */
export function textureFromPixels(pixels: Uint8ClampedArray<ArrayBuffer>, size: number): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, size, size), 0, 0);
  return Texture.from(canvas, true);
}
