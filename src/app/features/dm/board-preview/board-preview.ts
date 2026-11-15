import { Component, computed, inject, signal } from '@angular/core';

import type { Camera } from '../../../core/models/game-state.model';
import { computeLayout, visibleCells } from '../../../renderer/layout';
import { RENDER_STYLES } from '../../../renderer/render-style';
import { BoardCanvas } from '../../../shared/board-canvas';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';

interface Pan {
  /** Case sous le pointeur au début du glisser. */
  start: Camera;
  /** Caméra effective (déjà bornée) au début du glisser. */
  camera: Camera;
}

/**
 * Aperçu du plateau côté MJ : toute la grille, avec un cadre autour de la
 * zone visible sur la TV. Glisser l'aperçu déplace ce cadre.
 */
@Component({
  selector: 'app-board-preview',
  imports: [BoardCanvas],
  template: `
    <section class="panel">
      <header class="mb-3 flex items-center justify-between gap-4">
        <h2 class="text-lg font-semibold">Aperçu du plateau</h2>
        <label class="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            class="size-4 accent-accent"
            [checked]="store.fog().enabled"
            (change)="onFogToggle($event)"
          />
          Brouillard
        </label>
      </header>

      <app-board-canvas
        class="h-[50vh] touch-none"
        [class.cursor-grab]="frame() && !panning()"
        [class.cursor-grabbing]="panning()"
        mode="dm"
        [view]="store.boardView()"
        [frame]="frame()"
        (pointerdown)="startPan($event)"
        (pointermove)="movePan($event)"
        (pointerup)="endPan()"
        (pointercancel)="endPan()"
      />

      <p class="mt-2 text-sm text-muted">
        @if (frame()) {
          Le cadre montre ce qu'affiche la TV : faites glisser l'aperçu pour le déplacer.
        } @else {
          Ouvrez le plateau pour voir quelle partie de la carte s'affiche sur la TV.
        }
      </p>
    </section>
  `,
})
export class BoardPreview {
  protected readonly store = inject(GameStore);
  private readonly boardViewport = inject(DmSyncEffects).boardViewport;

  protected readonly panning = signal(false);
  private pan: Pan | null = null;

  /** Zone visible sur la TV, calculée exactement comme le fait le renderer du plateau. */
  protected readonly frame = computed(() => {
    const viewport = this.boardViewport();
    if (!viewport) return null;
    return visibleCells(
      viewport.width,
      viewport.height,
      this.store.grid(),
      this.store.camera(),
      RENDER_STYLES.board.fit,
    );
  });

  protected onFogToggle(event: Event): void {
    this.store.setFogEnabled((event.target as HTMLInputElement).checked);
  }

  protected startPan(event: PointerEvent): void {
    const start = this.toCell(event);
    const camera = this.boundCamera(this.store.camera());
    if (event.button !== 0 || !start || !camera) return;

    // Le glisser continue même si le pointeur sort de l'aperçu.
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    this.pan = { start, camera };
    this.panning.set(true);
  }

  protected movePan(event: PointerEvent): void {
    const cell = this.pan && this.toCell(event);
    if (!this.pan || !cell) return;

    // Le cadre suit le pointeur. On stocke la caméra déjà bornée : sinon,
    // après avoir buté contre un bord, il faudrait « revenir » avant de repartir.
    const camera = this.boundCamera({
      x: this.pan.camera.x + cell.x - this.pan.start.x,
      y: this.pan.camera.y + cell.y - this.pan.start.y,
    });
    if (camera) this.store.setCamera(camera);
  }

  protected endPan(): void {
    this.pan = null;
    this.panning.set(false);
  }

  /** Position du pointeur dans l'aperçu, en cases. */
  private toCell(event: PointerEvent): Camera | null {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const layout = computeLayout(
      rect.width,
      rect.height,
      this.store.grid(),
      this.store.camera(),
      RENDER_STYLES.dm.fit,
    );
    if (layout.cellPx === 0) return null;
    return {
      x: (event.clientX - rect.left - layout.originX) / layout.cellPx,
      y: (event.clientY - rect.top - layout.originY) / layout.cellPx,
    };
  }

  /** Caméra ramenée dans la grille pour l'écran de la TV (`null` si on ne le connaît pas). */
  private boundCamera(camera: Camera): Camera | null {
    const viewport = this.boardViewport();
    if (!viewport) return null;
    return computeLayout(
      viewport.width,
      viewport.height,
      this.store.grid(),
      camera,
      RENDER_STYLES.board.fit,
    ).camera;
  }
}
