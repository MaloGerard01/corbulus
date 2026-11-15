import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';

import { centeredCamera, type Camera } from '../../../core/models/game-state.model';
import { computeLayout, visibleCells, type CellPoint } from '../../../renderer/layout';
import { RENDER_STYLES } from '../../../renderer/render-style';
import { BoardCanvas } from '../../../shared/board-canvas';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';
import { resizeFrame, type FrameCorner } from './frame-resize';

type Drag =
  /** Déplacement du cadre : case sous le pointeur et caméra (bornée) au départ. */
  | { kind: 'pan'; start: CellPoint; camera: Camera }
  /** Redimensionnement par un coin : le coin opposé reste fixe. */
  | { kind: 'resize'; corner: FrameCorner; anchor: CellPoint };

const CORNERS: readonly FrameCorner[] = ['top-left', 'bottom-right'];

const CORNER_LABELS: Record<FrameCorner, string> = {
  'top-left': 'Redimensionner depuis le coin haut gauche',
  'bottom-right': 'Redimensionner depuis le coin bas droit',
};

/**
 * Aperçu côté MJ de la carte en édition (affichée ou non) : toute la grille,
 * avec un cadre autour de la zone que la TV en montre. Glisser l'aperçu
 * déplace ce cadre ; en mode « Précis », ses coins permettent de le
 * redimensionner (zoom).
 */
@Component({
  selector: 'app-board-preview',
  imports: [BoardCanvas],
  template: `
    <section class="panel">
      <header class="mb-3 flex items-center justify-between gap-4">
        <div class="flex min-w-0 items-center gap-2">
          <h2 class="shrink-0 text-lg font-semibold">Aperçu</h2>
          @if (store.selectedMap(); as map) {
            <span class="truncate text-muted" [title]="map.name">{{ map.name }}</span>
            @if (onScreen()) {
              <span
                data-status
                class="shrink-0 rounded bg-accent px-1.5 py-0.5 text-xs font-semibold text-white"
              >
                À l'écran
              </span>
            } @else {
              <span
                data-status
                class="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted"
              >
                Non affichée
              </span>
            }
          } @else {
            <span class="text-muted">aucune carte sélectionnée</span>
          }
        </div>
        <label
          class="flex shrink-0 items-center gap-2"
          [class.cursor-pointer]="store.selectedMap()"
          [class.opacity-50]="!store.selectedMap()"
          [title]="store.selectedMap() ? '' : 'Sélectionnez une carte pour gérer son brouillard'"
        >
          <input
            type="checkbox"
            class="size-4 accent-accent"
            [checked]="store.fog().enabled"
            [disabled]="!store.selectedMap()"
            (change)="onFogToggle($event)"
          />
          Brouillard
        </label>
      </header>

      <div
        #surface
        class="relative h-[50vh] touch-none"
        [class.cursor-grab]="preciseUnavailable() === null && !drag()"
        [class.cursor-grabbing]="drag()?.kind === 'pan'"
        (pointerdown)="startPan($event)"
        (pointermove)="moveDrag($event)"
        (pointerup)="endDrag()"
        (pointercancel)="endDrag()"
      >
        <app-board-canvas
          class="absolute inset-0"
          mode="dm"
          [view]="store.selectedView()"
          [frame]="frame()"
        />

        @if (handles(); as handles) {
          @for (corner of corners; track corner) {
            <div
              class="absolute size-4 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize rounded-sm border-2 border-white bg-accent shadow-md"
              [style.left.px]="handles[corner].left"
              [style.top.px]="handles[corner].top"
              [attr.data-corner]="corner"
              [attr.aria-label]="cornerLabels[corner]"
              (pointerdown)="startResize(corner, $event)"
            ></div>
          }
        }
      </div>

      <footer class="mt-2 flex items-center">
        <label
          class="flex items-center gap-2"
          [class.cursor-pointer]="preciseUnavailable() === null"
          [class.opacity-50]="preciseUnavailable() !== null"
          [title]="
            preciseUnavailable() ??
            'Redimensionner le cadre par ses coins pour zoomer sur une partie de la carte'
          "
        >
          <input
            type="checkbox"
            class="size-4 accent-accent"
            [checked]="store.preciseView()"
            [disabled]="preciseUnavailable() !== null"
            (change)="onPreciseToggle($event)"
          />
          Mode précis
        </label>
      </footer>
    </section>
  `,
})
export class BoardPreview {
  protected readonly store = inject(GameStore);
  private readonly boardViewport = inject(DmSyncEffects).boardViewport;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  protected readonly corners = CORNERS;
  protected readonly cornerLabels = CORNER_LABELS;
  protected readonly drag = signal<Drag | null>(null);

  /** Taille de l'aperçu, en pixels CSS. */
  private readonly previewSize = signal<{ width: number; height: number } | null>(null);

  /** Placement de la grille dans l'aperçu (même calcul que son renderer). */
  private readonly previewLayout = computed(() => {
    const size = this.previewSize();
    if (!size) return null;
    const grid = this.store.grid();
    return computeLayout(size.width, size.height, grid, centeredCamera(grid), RENDER_STYLES.dm.fit);
  });

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

  /** Pourquoi la vue de la TV ne peut pas être réglée (`null` : elle peut l'être). */
  /** La carte en édition est-elle celle que voient les joueurs ? */
  protected readonly onScreen = computed(() => {
    const selected = this.store.selectedMap();
    return selected !== null && selected.id === this.store.activeMap()?.id;
  });

  protected readonly preciseUnavailable = computed(() => {
    if (!this.store.selectedMap()) return 'Sélectionnez une carte pour régler sa vue';
    if (!this.frame()) return 'Ouvrez le plateau pour régler la zone affichée sur la TV';
    return null;
  });

  /** Position des poignées dans l'aperçu, en pixels (mode « Précis » seulement). */
  protected readonly handles = computed(() => {
    const frame = this.frame();
    const layout = this.previewLayout();
    if (!this.store.preciseView() || this.preciseUnavailable() || !frame || !layout) return null;

    const toPx = (x: number, y: number) => ({
      left: layout.originX + x * layout.cellPx,
      top: layout.originY + y * layout.cellPx,
    });
    return {
      'top-left': toPx(frame.x, frame.y),
      'bottom-right': toPx(frame.x + frame.w, frame.y + frame.h),
    } satisfies Record<FrameCorner, { left: number; top: number }>;
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.previewSize.set({ width, height });
      });
      observer.observe(this.surface().nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected onFogToggle(event: Event): void {
    this.store.setFogEnabled((event.target as HTMLInputElement).checked);
  }

  protected onPreciseToggle(event: Event): void {
    this.store.setPreciseView((event.target as HTMLInputElement).checked);
  }

  protected startPan(event: PointerEvent): void {
    const start = this.toCell(event);
    const camera = this.boundCamera(this.store.camera());
    if (event.button !== 0 || this.preciseUnavailable() || !start || !camera) return;

    this.capture(event);
    this.drag.set({ kind: 'pan', start, camera });
  }

  protected startResize(corner: FrameCorner, event: PointerEvent): void {
    // Sinon l'aperçu démarrerait aussi un déplacement.
    event.stopPropagation();
    const frame = this.frame();
    if (event.button !== 0 || !frame) return;

    const anchor =
      corner === 'bottom-right'
        ? { x: frame.x, y: frame.y }
        : { x: frame.x + frame.w, y: frame.y + frame.h };
    this.capture(event);
    this.drag.set({ kind: 'resize', corner, anchor });
  }

  protected moveDrag(event: PointerEvent): void {
    const drag = this.drag();
    const cell = drag && this.toCell(event);
    const viewport = this.boardViewport();
    if (!drag || !cell || !viewport) return;

    const camera =
      drag.kind === 'pan'
        ? {
            ...drag.camera,
            x: drag.camera.x + cell.x - drag.start.x,
            y: drag.camera.y + cell.y - drag.start.y,
          }
        : resizeFrame(drag.corner, drag.anchor, cell, viewport, this.store.grid());

    // On stocke la caméra déjà bornée : sinon, après avoir buté contre un
    // bord, il faudrait « revenir » avant de repartir.
    const bounded = this.boundCamera(camera);
    if (bounded) this.store.setCamera(bounded);
  }

  protected endDrag(): void {
    this.drag.set(null);
  }

  /** Le glisser continue même si le pointeur sort de l'aperçu. */
  private capture(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  /** Position du pointeur dans l'aperçu, en cases. */
  private toCell(event: PointerEvent): CellPoint | null {
    const layout = this.previewLayout();
    if (!layout || layout.cellPx === 0) return null;
    const rect = this.surface().nativeElement.getBoundingClientRect();
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
