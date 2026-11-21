import { Shader, type TextureSource } from 'pixi.js';

import { FOG_DARK, FOG_LIGHT } from './fog-textures';

/**
 * Rendu du brouillard par un shader : le brouillard de guerre prend la
 * texture de fumée (`fogSmokePixels`), avec des bords qui ondulent
 * doucement ; l'obscurité reste un noir uni au bord adouci. Rien n'est animé.
 *
 * Il lit la couverture peinte (`display` de `FogLayer`, en blanc pour le
 * brouillard de guerre et en noir pour l'obscurité) et la texture de fumée,
 * ancrée sur les cases : même motif sur la TV et dans l'aperçu du MJ,
 * quelle que soit la résolution.
 */

/** La texture de fumée couvre ce nombre de cases, puis se répète. */
export const FOG_TILE_CELLS = 12;

/**
 * Bord : la transition se resserre sur cette part de la couverture, autour
 * d'un seuil qui dépend de la densité des nappes de fumée.
 */
export const EDGE_SOFTNESS = 0.15;
/**
 * Seuil sous la fumée la plus dense, et sous la plus légère. Ils gardent une
 * marge de 0,01 avec les extrêmes : une couverture pleine reste exactement
 * pleine (et nulle, nulle) malgré les arrondis du GPU.
 */
export const EDGE_THRESHOLD_DENSE = EDGE_SOFTNESS + 0.01;
export const EDGE_THRESHOLD_LIGHT = 1 - EDGE_SOFTNESS - 0.01;
/** Part du bord qui suit la fumée (0 : fondu lisse du pinceau, 1 : bord franc et ondulé). */
export const EDGE_NOISE = 0.5;

/**
 * Opacité du brouillard de guerre selon la couverture peinte (0–1) et la
 * densité des nappes de fumée (0–1). Le fondu peint suit un peu la fumée :
 * les nappes denses avancent dans le fondu, les creux reculent, mais une
 * couverture pleine reste pleine (la carte n'est jamais dévoilée sous le
 * brouillard) et une couverture nulle, nulle. Même calcul que le shader.
 */
export function fogEdgeAlpha(coverage: number, density: number): number {
  const threshold = lerp(EDGE_THRESHOLD_LIGHT, EDGE_THRESHOLD_DENSE, density);
  const eroded = smoothstep(threshold - EDGE_SOFTNESS, threshold + EDGE_SOFTNESS, coverage);
  return lerp(coverage, eroded, EDGE_NOISE);
}

/** Shader du maillage qui couvre la grille (positions en cases, UV dans `display`). */
export function createFogShader(display: TextureSource, smoke: TextureSource): Shader {
  return Shader.from({
    gl: { name: 'fog', vertex: VERTEX, fragment: FRAGMENT },
    resources: {
      uDisplay: display,
      uSmoke: smoke,
      fogUniforms: {
        uTileCells: { value: FOG_TILE_CELLS, type: 'f32' },
      },
    },
  });
}

const glslFloat = (value: number) => (Number.isInteger(value) ? `${value}.0` : `${value}`);
const glslColor = ([r, g, b]: readonly number[]) =>
  `vec3(${glslFloat(r)}, ${glslFloat(g)}, ${glslFloat(b)})`;

/*
 * GLSL au format WebGL 2 (`in` / `out`, `texture`, `finalColor`) : Pixi
 * l'adapte lui-même pour WebGL 1. Matrices et alpha fournis par Pixi pour
 * tout maillage (uniformes globaux et locaux). Sources en ASCII strict :
 * WebGL 1 refuse tout autre caractère, même dans un commentaire.
 *
 * Fragment, pas à pas :
 * - couverture peinte (alpha prémultiplié) ; sa couleur dit le style :
 *   blanc = brouillard de guerre (`fogness` 1), noir = obscurité (0) ;
 * - texture de fumée lue à la position en cases : rouge = teinte, de
 *   `FOG_DARK` à `FOG_LIGHT` ; vert = densité des nappes, pour le bord ;
 * - bord (`fogEdgeAlpha`), pour le brouillard de guerre seulement.
 */
const VERTEX = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;

out vec2 vUV;
out vec2 vCell;
out float vAlpha;

uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform vec4 uWorldColorAlpha;
uniform mat3 uTransformMatrix;
uniform vec4 uColor;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vCell = aPosition;
  vAlpha = uColor.a * uWorldColorAlpha.a;
}
`;

const FRAGMENT = /* glsl */ `
in vec2 vUV;
in vec2 vCell;
in float vAlpha;

out vec4 finalColor;

uniform sampler2D uDisplay;
uniform sampler2D uSmoke;
uniform float uTileCells;

const vec3 FOG_DARK = ${glslColor(FOG_DARK)};
const vec3 FOG_LIGHT = ${glslColor(FOG_LIGHT)};

const float EDGE_SOFTNESS = ${glslFloat(EDGE_SOFTNESS)};
const float EDGE_THRESHOLD_DENSE = ${glslFloat(EDGE_THRESHOLD_DENSE)};
const float EDGE_THRESHOLD_LIGHT = ${glslFloat(EDGE_THRESHOLD_LIGHT)};
const float EDGE_NOISE = ${glslFloat(EDGE_NOISE)};

void main() {
  vec4 paint = texture(uDisplay, vUV);
  float coverage = paint.a;
  if (coverage < 0.001) {
    finalColor = vec4(0.0);
    return;
  }
  float fogness = clamp(paint.r / coverage, 0.0, 1.0);

  vec4 smokeSample = texture(uSmoke, vCell / uTileCells);
  vec3 smoke = mix(FOG_DARK, FOG_LIGHT, smokeSample.r);
  float density = smokeSample.g;

  float threshold = mix(EDGE_THRESHOLD_LIGHT, EDGE_THRESHOLD_DENSE, density);
  float eroded = smoothstep(threshold - EDGE_SOFTNESS, threshold + EDGE_SOFTNESS, coverage);
  float alpha = mix(coverage, mix(coverage, eroded, EDGE_NOISE), fogness) * vAlpha;

  finalColor = vec4(smoke * fogness * alpha, alpha);
}
`;

/** Sources GLSL, exposées pour les tests. */
export const FOG_GLSL = { vertex: VERTEX, fragment: FRAGMENT };

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
