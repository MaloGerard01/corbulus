import { Container, Graphics, Sprite, type Texture, type Ticker } from 'pixi.js';

import type { BoardEvent } from '../../core/models/sync-message.model';
import {
  GLOWING_KINDS,
  PUFF_VARIANTS,
  SHOCKWAVE_COLOR,
  explosionDuration,
  explosionParticles,
  particleFrame,
  shockwaveFrame,
  type ParticleFrame,
} from '../explosion';
import { glowPixels, puffPixels } from '../explosion-textures';
import { textureFromPixels } from '../pixel-texture';

/** Effets joués par ce calque ; le focus, lui, déplace la caméra (voir `BoardRenderer`). */
export type LayerEffect = Exclude<BoardEvent, { kind: 'focus' }>;

const PING_MS = 500;
/** Rayon du ping à la fin de son expansion, en cases. */
const PING_RADIUS = 1.5;
/** La secousse s'atténue sur ses dernières millisecondes. */
const SHAKE_FADE_MS = 300;
/** Taille des textures de l'explosion, en pixels. */
const GLOW_TEXTURE_PX = 64;
const PUFF_TEXTURE_PX = 128;

interface ExplosionTextures {
  glow: Texture;
  puffs: Texture[];
}

interface Animation {
  start: number;
  durationMs: number;
  /** `t` va de 0 à 1 sur la durée de l'animation. */
  frame: (t: number) => void;
  done: () => void;
}

/**
 * Effets ponctuels pour attirer l'attention des joueurs. Tout est en cases
 * (épaisseurs comprises) : un effet a la même taille relative sur la TV et
 * dans l'aperçu du MJ.
 */
export class EffectsLayer {
  readonly view = new Container();

  private animations: Animation[] = [];
  /** Secousse en cours : une nouvelle la remplace. */
  private shaking: Animation | null = null;
  /** Calculées à la première explosion, puis réutilisées. */
  private explosionTextures: ExplosionTextures | null = null;

  /**
   * @param shakeTarget conteneur du monde, décalé via son `pivot` (en cases)
   *   pour ne pas interférer avec le placement calculé par le renderer.
   */
  constructor(
    private readonly ticker: Ticker,
    private readonly shakeTarget: Container,
  ) {
    this.ticker.add(this.tick);
  }

  play(event: LayerEffect): void {
    switch (event.kind) {
      case 'ping':
        return this.ping(event.x, event.y, event.color);
      case 'shake':
        return this.shake(event.durationMs, event.amplitude);
      case 'explosion':
        return this.explosion(event.x, event.y, event.radius);
    }
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.animations = [];
    this.shaking = null;
    this.view.destroy({ children: true });
    if (this.explosionTextures) {
      const { glow, puffs } = this.explosionTextures;
      [glow, ...puffs].forEach((texture) => texture.destroy(true));
      this.explosionTextures = null;
    }
  }

  /** Rond qui s'agrandit en une demi-seconde, en s'effaçant sur la fin. */
  private ping(x: number, y: number, color: string): void {
    const g = new Graphics();
    this.view.addChild(g);

    this.animate(
      PING_MS,
      (t) => {
        const radius = PING_RADIUS * (0.2 + 0.8 * easeOut(t));
        const alpha = 1 - t * t;
        g.clear()
          .circle(x, y, radius)
          .fill({ color, alpha: 0.45 * alpha })
          .stroke({ width: 0.15, color, alpha });
      },
      () => g.destroy(),
    );
  }

  /** Tremblement du monde pendant `durationMs`, d'au plus `amplitude` cases, atténué sur la fin. */
  private shake(durationMs: number, amplitude: number): void {
    if (this.shaking) this.cancel(this.shaking);

    const shaking = this.animate(
      durationMs,
      (t) => {
        const remainingMs = (1 - t) * durationMs;
        const offset = Math.max(0, amplitude) * Math.min(1, remainingMs / SHAKE_FADE_MS);
        this.shakeTarget.pivot.set(randomSigned() * offset, randomSigned() * offset);
      },
      () => {
        this.shakeTarget.pivot.set(0, 0);
        if (this.shaking === shaking) this.shaking = null;
      },
    );
    this.shaking = shaking;
  }

  /**
   * Explosion vue du dessus (voir explosion.ts) : un sprite par particule,
   * plus l'onde de choc, le tout détruit à la fin.
   */
  private explosion(x: number, y: number, radius: number): void {
    const textures = this.getExplosionTextures();
    const group = new Container();
    group.position.set(x, y);
    this.view.addChild(group);

    // Particules déjà dans l'ordre d'empilement.
    const particles = explosionParticles(radius);
    const sprites = particles.map((particle) => {
      const texture = particle.kind === 'smoke' ? textures.puffs[particle.variant] : textures.glow;
      const sprite = new Sprite({ texture, anchor: 0.5, visible: false });
      if (GLOWING_KINDS.has(particle.kind)) sprite.blendMode = 'add';
      return group.addChild(sprite);
    });
    const shockwave = group.addChild(new Graphics());
    shockwave.blendMode = 'add';

    const total = explosionDuration(particles);
    this.animate(
      total,
      (t) => {
        const elapsed = t * total;
        particles.forEach((particle, i) => showParticle(sprites[i], particleFrame(particle, elapsed)));

        shockwave.clear();
        const ring = shockwaveFrame(radius, elapsed);
        if (ring) {
          shockwave
            .circle(0, 0, ring.radius)
            .stroke({ width: ring.width, color: SHOCKWAVE_COLOR, alpha: ring.alpha });
        }
      },
      // Les textures sont partagées : seuls les sprites sont détruits.
      () => group.destroy({ children: true }),
    );
  }

  private getExplosionTextures(): ExplosionTextures {
    this.explosionTextures ??= {
      glow: textureFromPixels(glowPixels(GLOW_TEXTURE_PX), GLOW_TEXTURE_PX),
      puffs: Array.from({ length: PUFF_VARIANTS }, (_, i) =>
        textureFromPixels(puffPixels(PUFF_TEXTURE_PX, 7 + 13 * i), PUFF_TEXTURE_PX),
      ),
    };
    return this.explosionTextures;
  }

  private animate(durationMs: number, frame: (t: number) => void, done: () => void): Animation {
    const animation: Animation = {
      start: performance.now(),
      durationMs: Math.max(1, durationMs),
      frame,
      done,
    };
    this.animations.push(animation);
    frame(0);
    return animation;
  }

  private cancel(animation: Animation): void {
    this.animations = this.animations.filter((a) => a !== animation);
    animation.done();
  }

  private readonly tick = (): void => {
    if (this.animations.length === 0) return;
    const now = performance.now();
    this.animations = this.animations.filter((a) => {
      const t = clamp01((now - a.start) / a.durationMs);
      a.frame(t);
      if (t < 1) return true;
      a.done();
      return false;
    });
  };
}

/** Place un sprite selon l'état de sa particule (`null` : caché). Tailles en cases. */
function showParticle(sprite: Sprite, frame: ParticleFrame | null): void {
  sprite.visible = frame !== null && frame.alpha > 0;
  if (!frame || !sprite.visible) return;
  sprite.position.set(frame.x, frame.y);
  sprite.scale.set(frame.width / sprite.texture.width, frame.height / sprite.texture.height);
  sprite.rotation = frame.rotation;
  sprite.alpha = frame.alpha;
  sprite.tint = frame.tint;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function randomSigned(): number {
  return Math.random() * 2 - 1;
}
