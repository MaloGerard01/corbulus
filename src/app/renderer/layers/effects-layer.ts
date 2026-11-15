import { Container, Graphics, type Ticker } from 'pixi.js';

import type { Shape } from '../../core/models/game-state.model';
import type { BoardEvent } from '../../core/models/sync-message.model';
import { traceShape } from '../shapes';

const PING_MS = 1800;
const SHAKE_MS = 600;
const FOCUS_FADE_MS = 300;
/** Amplitude du tremblement, en cases. */
const SHAKE_AMPLITUDE = 0.25;
const FOCUS_COLOR = '#facc15';

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

  play(event: BoardEvent): void {
    switch (event.kind) {
      case 'ping':
        return this.ping(event.x, event.y, event.color);
      case 'focus':
        return this.focus(event.shape, event.durationMs);
      case 'shake':
        return this.shake();
    }
  }

  destroy(): void {
    this.ticker.remove(this.tick);
    this.animations = [];
    this.view.destroy({ children: true });
  }

  /** Trois ondes décalées qui s'élargissent autour d'un point. */
  private ping(x: number, y: number, color: string): void {
    const g = new Graphics();
    this.view.addChild(g);

    this.animate(
      PING_MS,
      (t) => {
        g.clear();
        for (let i = 0; i < 3; i++) {
          const k = clamp01((t - i * 0.25) / 0.5);
          if (k === 0 || k === 1) continue;
          g.circle(x, y, 0.2 + easeOut(k) * 1.8).stroke({ width: 0.12, color, alpha: 1 - k });
        }
        g.circle(x, y, 0.3).fill({ color, alpha: 1 - t });
      },
      () => g.destroy(),
    );
  }

  /** Assombrit tout sauf la forme, entourée d'un contour qui pulse. */
  private focus(shape: Shape, durationMs: number): void {
    const dim = traceShape(new Graphics().rect(-1e4, -1e4, 2e4, 2e4).fill(0x000000), shape).cut();
    const outline = traceShape(new Graphics(), shape).stroke({ width: 0.15, color: FOCUS_COLOR });
    this.view.addChild(dim, outline);

    const total = Math.max(durationMs, 2 * FOCUS_FADE_MS);
    this.animate(
      total,
      (t) => {
        const elapsed = t * total;
        const fade = Math.min(1, elapsed / FOCUS_FADE_MS, (total - elapsed) / FOCUS_FADE_MS);
        dim.alpha = 0.7 * fade;
        outline.alpha = fade * (0.6 + 0.4 * Math.sin(elapsed / 150));
      },
      () => {
        dim.destroy();
        outline.destroy();
      },
    );
  }

  private shake(): void {
    this.animate(
      SHAKE_MS,
      (t) => {
        const amplitude = SHAKE_AMPLITUDE * (1 - t);
        this.shakeTarget.pivot.set(randomSigned() * amplitude, randomSigned() * amplitude);
      },
      () => this.shakeTarget.pivot.set(0, 0),
    );
  }

  private animate(durationMs: number, frame: (t: number) => void, done: () => void): void {
    const animation: Animation = { start: performance.now(), durationMs, frame, done };
    this.animations.push(animation);
    frame(0);
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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

function randomSigned(): number {
  return Math.random() * 2 - 1;
}
