import type { Graphics } from 'pixi.js';

import type { Shape } from '../core/models/game-state.model';

/** Ajoute le contour d'une forme (en cases) au tracé, sans le remplir. */
export function traceShape(g: Graphics, shape: Shape): Graphics {
  switch (shape.kind) {
    case 'circle':
      return g.circle(shape.cx, shape.cy, shape.r);
    case 'rect':
      return g.rect(shape.x, shape.y, shape.w, shape.h);
    case 'polygon':
      return g.poly(shape.points.flat(), true);
  }
}
