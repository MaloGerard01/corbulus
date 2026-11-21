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

import {
  DEFAULT_FOG_FADE,
  centeredCamera,
  type Camera,
  type FogStyle,
} from '../../../core/models/game-state.model';
import type { BoardEvent } from '../../../core/models/sync-message.model';
import { FOCUS_MOVE_MS } from '../../../renderer/camera-focus';
import { computeLayout, visibleCells, type CellPoint } from '../../../renderer/layout';
import { RENDER_STYLES } from '../../../renderer/render-style';
import { AnimatedMap } from '../../../shared/animated-map';
import { BoardCanvas } from '../../../shared/board-canvas';
import { DmSyncEffects } from '../state/dm-sync.effects';
import { GameStore } from '../state/game.store';
import { resizeFrame, type FrameCorner } from './frame-resize';
import {
  BRUSH_SIZE,
  EXPLOSION_RADIUS,
  FOCUS_SECONDS,
  FOCUS_ZONE,
  PreviewToolbar,
  type BrushMode,
  type EffectTool,
  type PreviewSection,
} from './preview-toolbar';

type Drag =
  /** Déplacement du cadre : case sous le pointeur et caméra (bornée) au départ. */
  | { kind: 'pan'; start: CellPoint; camera: Camera }
  /** Redimensionnement par un coin : le coin opposé reste fixe. */
  | { kind: 'resize'; corner: FrameCorner; anchor: CellPoint }
  /** Coup de pinceau en cours : son id, et le dernier point enregistré. */
  | { kind: 'paint'; strokeId: string; size: number; last: CellPoint };

const CORNERS: readonly FrameCorner[] = ['top-left', 'bottom-right'];

const CORNER_LABELS: Record<FrameCorner, string> = {
  'top-left': 'Redimensionner depuis le coin haut gauche',
  'bottom-right': 'Redimensionner depuis le coin bas droit',
};

/**
 * Distance minimale entre deux points d'un tracé, en fraction du diamètre du
 * pinceau : les empreintes sont interpolées entre eux, inutile d'en garder plus.
 */
const STROKE_POINT_STEP = 0.1;

/** Couleur du ping sur la TV. */
const PING_COLOR = '#3b82f6';

/** Rectangle dans l'aperçu, en pixels. */
interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Aperçu côté MJ de la carte en édition (affichée ou non) : toute la grille,
 * avec un cadre autour de la zone que la TV en montre.
 *
 * La section ouverte de la barre d'outils, à droite, décide de l'outil :
 * « Affichage » pour déplacer ce cadre (et, en mode « Précis », le
 * redimensionner par ses coins), « Brouillard » pour le pinceau, « Effets »
 * pour les effets (ping, focus, explosion au clic). Tout fermé, l'aperçu est en
 * lecture seule.
 *
 * Les effets partent vers la TV et sont rejoués ici ; le focus, qui déplace
 * la caméra de la TV, est montré par la zone qu'il affiche.
 */
@Component({
  selector: 'app-board-preview',
  imports: [AnimatedMap, BoardCanvas, PreviewToolbar],
  host: { '(document:keydown)': 'onKeydown($event)' },
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
      </header>

      <div class="flex flex-col gap-4 lg:flex-row">
        <div
          #surface
          class="relative h-[50vh] min-w-0 flex-1 touch-none overflow-hidden"
          [class.cursor-grab]="tool() === 'pan' && preciseUnavailable() === null && !drag()"
          [class.cursor-grabbing]="drag()?.kind === 'pan'"
          [class.cursor-crosshair]="crosshair()"
          (pointerdown)="startDrag($event)"
          (pointermove)="onPointerMove($event)"
          (pointerup)="endDrag()"
          (pointercancel)="endDrag()"
          (pointerleave)="hover.set(null)"
        >
          <app-board-canvas
            class="absolute inset-0"
            mode="dm"
            [view]="store.selectedView()"
            [frame]="frame()"
          />

          <!-- Carte animée : montrée en entier et sans le son (il ne sort que sur la TV). -->
          @if (store.selectedView().animated; as media) {
            <app-animated-map class="absolute inset-0" fit="contain" [media]="media" />
          }

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

          <!-- Focus : zone que la TV affiche en ce moment, et celle qu'elle afficherait au clic. -->
          @if (focusActive(); as zone) {
            <div
              data-focus-active
              class="pointer-events-none absolute border-2 border-amber-400 bg-amber-400/10"
              [style.left.px]="zone.left"
              [style.top.px]="zone.top"
              [style.width.px]="zone.width"
              [style.height.px]="zone.height"
            >
              <span class="absolute top-1 left-1 rounded bg-amber-400 px-1 text-xs font-semibold text-black">
                Focus
              </span>
            </div>
          }
          @if (focusPreview(); as zone) {
            <div
              data-focus-preview
              class="pointer-events-none absolute border-2 border-dashed border-white/80 shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
              [style.left.px]="zone.left"
              [style.top.px]="zone.top"
              [style.width.px]="zone.width"
              [style.height.px]="zone.height"
            ></div>
          }

          @if (explosionCursor(); as cursor) {
            <div
              data-explosion-cursor
              class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-orange-400 bg-orange-500/10"
              [style.left.px]="cursor.left"
              [style.top.px]="cursor.top"
              [style.width.px]="cursor.size"
              [style.height.px]="cursor.size"
            ></div>
          }

          <!-- Pinceau sous le pointeur : cœur (trait plein) et étendue du fondu (pointillés). -->
          @if (brushCursor(); as cursor) {
            @if (cursor.outer > cursor.core) {
              <div
                data-brush-fade
                class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/70"
                [style.left.px]="cursor.left"
                [style.top.px]="cursor.top"
                [style.width.px]="cursor.outer"
                [style.height.px]="cursor.outer"
              ></div>
            }
            <div
              data-brush-cursor
              class="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.6)]"
              [style.left.px]="cursor.left"
              [style.top.px]="cursor.top"
              [style.width.px]="cursor.core"
              [style.height.px]="cursor.core"
            ></div>
          }
        </div>

        <app-preview-toolbar
          class="lg:w-72 lg:shrink-0"
          [(section)]="section"
          [(brushMode)]="brushMode"
          [(fogStyle)]="fogStyle"
          [(brushSize)]="brushSize"
          [(fade)]="fade"
          [viewUnavailable]="preciseUnavailable()"
          [(effect)]="effect"
          [(focusSeconds)]="focusSeconds"
          [(explosionRadius)]="explosionRadius"
          [effectsUnavailable]="effectsUnavailable()"
          (shake)="playEffect($event)"
        />
      </div>
    </section>
  `,
})
export class BoardPreview {
  protected readonly store = inject(GameStore);
  private readonly dmSync = inject(DmSyncEffects);
  private readonly boardViewport = this.dmSync.boardViewport;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly canvas = viewChild.required(BoardCanvas);

  protected readonly corners = CORNERS;
  protected readonly cornerLabels = CORNER_LABELS;
  protected readonly drag = signal<Drag | null>(null);

  /** Section ouverte de la barre d'outils ; tout fermé : lecture seule. */
  protected readonly section = signal<PreviewSection | null>(null);
  protected readonly brushMode = signal<BrushMode>('paint');
  protected readonly fogStyle = signal<FogStyle>('darkness');
  protected readonly brushSize = signal(BRUSH_SIZE.default);
  protected readonly fade = signal(DEFAULT_FOG_FADE);
  protected readonly effect = signal<EffectTool>('ping');
  protected readonly focusSeconds = signal(FOCUS_SECONDS.default);
  protected readonly explosionRadius = signal(EXPLOSION_RADIUS.default);
  /** Position du pointeur dans l'aperçu, en pixels (`null` hors de l'aperçu). */
  protected readonly hover = signal<{ x: number; y: number } | null>(null);

  /** Carte en édition animée (GIF, vidéo) : plein écran, sans cadrage ni brouillard. */
  private readonly isAnimated = computed(() => this.store.selectedView().animated !== null);

  /** Outil actif sur l'aperçu, décidé par la section ouverte de la barre d'outils. */
  protected readonly tool = computed<'pan' | BrushMode | EffectTool | null>(() => {
    // Carte animée : ni cadrage ni brouillard, l'aperçu reste en lecture seule.
    if (this.isAnimated()) return null;
    switch (this.section()) {
      case 'display':
        return 'pan';
      case 'fog':
        return this.brushMode();
      case 'effects':
        return this.effectsUnavailable() ? null : this.effect();
      default:
        return null;
    }
  });

  /** Outils qui visent un point précis de la carte. */
  protected readonly crosshair = computed(() => {
    switch (this.tool()) {
      case 'paint':
      case 'erase':
        return this.store.selectedMap() !== null;
      case 'ping':
      case 'focus':
      case 'explosion':
        return true;
      default:
        return false;
    }
  });

  /** Zone soufflée par une explosion sous le pointeur : centre et diamètre, en pixels. */
  protected readonly explosionCursor = computed(() => {
    const hover = this.hover();
    const layout = this.previewLayout();
    if (this.tool() !== 'explosion' || !hover || !layout) return null;
    return { left: hover.x, top: hover.y, size: 2 * this.explosionRadius() * layout.cellPx };
  });

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
    // Une carte animée remplit tout l'écran : pas de zone à encadrer.
    if (!viewport || this.isAnimated()) return null;
    return visibleCells(
      viewport.width,
      viewport.height,
      this.store.grid(),
      this.store.camera(),
      RENDER_STYLES.board.fit,
    );
  });

  /** La carte en édition est-elle celle que voient les joueurs ? */
  protected readonly onScreen = computed(() => {
    const selected = this.store.selectedMap();
    return selected !== null && selected.id === this.store.activeMap()?.id;
  });

  /**
   * Pourquoi les effets ne peuvent pas être joués (`null` : ils le peuvent).
   * Ils visent un endroit de la carte : celle que voient les joueurs.
   */
  protected readonly effectsUnavailable = computed(() => {
    if (!this.store.selectedMap()) return 'Sélectionnez une carte pour y jouer des effets.';
    if (!this.onScreen()) return "Affichez cette carte à l'écran pour y jouer des effets.";
    return null;
  });

  /** Focus en cours sur la TV : carte visée et caméra (effacé au début du retour). */
  private readonly activeFocus = signal<{ mapId: string; camera: Camera } | null>(null);
  private focusTimer: ReturnType<typeof setTimeout> | undefined;

  /** Zone que la TV affiche pendant le focus en cours, en pixels de l'aperçu. */
  protected readonly focusActive = computed(() => {
    const focus = this.activeFocus();
    if (!focus || focus.mapId !== this.store.selectedMap()?.id) return null;
    return this.boardZone(focus.camera);
  });

  /** Zone qu'afficherait un focus sur la case survolée (outil Focus). */
  protected readonly focusPreview = computed(() => {
    const hover = this.hover();
    const cell = hover && this.tool() === 'focus' ? this.pxToCell(hover) : null;
    return cell && this.inGrid(cell) ? this.boardZone(this.focusCameraAt(cell)) : null;
  });

  /** Pourquoi la vue de la TV ne peut pas être réglée (`null` : elle peut l'être). */
  protected readonly preciseUnavailable = computed(() => {
    if (!this.store.selectedMap()) return 'Sélectionnez une carte pour régler sa vue';
    if (this.isAnimated()) return "Une carte animée remplit tout l'écran";
    if (!this.frame()) return 'Ouvrez le plateau pour régler la zone affichée sur la TV';
    return null;
  });

  /** Position des poignées, en pixels (mode « Précis », outil « Déplacer »). */
  protected readonly handles = computed(() => {
    const frame = this.frame();
    const layout = this.previewLayout();
    const usable = this.store.preciseView() && this.tool() === 'pan' && !this.preciseUnavailable();
    if (!usable || !frame || !layout) return null;

    const toPx = (x: number, y: number) => ({
      left: layout.originX + x * layout.cellPx,
      top: layout.originY + y * layout.cellPx,
    });
    return {
      'top-left': toPx(frame.x, frame.y),
      'bottom-right': toPx(frame.x + frame.w, frame.y + frame.h),
    } satisfies Record<FrameCorner, { left: number; top: number }>;
  });

  /** Pinceau sous le pointeur, à l'échelle de l'aperçu : diamètres du cœur et du fondu, en pixels. */
  protected readonly brushCursor = computed(() => {
    const hover = this.hover();
    const layout = this.previewLayout();
    const painting = this.tool() === 'paint' || this.tool() === 'erase';
    if (!painting || !this.store.selectedMap() || !hover || !layout) return null;
    return {
      left: hover.x,
      top: hover.y,
      core: this.brushSize() * layout.cellPx,
      outer: (this.brushSize() + 2 * this.fade()) * layout.cellPx,
    };
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
    destroyRef.onDestroy(() => clearTimeout(this.focusTimer));
  }

  /** Envoie l'effet à la TV et le rejoue dans l'aperçu. */
  protected playEffect(event: BoardEvent): void {
    this.dmSync.sendEvent(event);
    // L'aperçu montre toujours toute la carte : le focus y est sans effet,
    // on encadre plutôt la zone que la TV affiche pendant ce temps.
    this.canvas().playEffect(event);
    if (event.kind === 'focus') this.showFocus(event.camera, event.durationMs);
  }

  /** Ctrl+Z annule le dernier tracé, sauf dans un champ de saisie (notes…). */
  protected onKeydown(event: KeyboardEvent): void {
    const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z';
    if (!isUndo || isTextField(event.target)) return;
    event.preventDefault();
    this.store.undoFog();
  }

  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    switch (this.tool()) {
      case 'pan':
        return this.startPan(event);
      case 'paint':
        return this.startPaint(event, 'hide');
      case 'erase':
        return this.startPaint(event, 'reveal');
      case 'ping':
        return this.playEffectAt(event, 'ping');
      case 'focus':
        return this.playEffectAt(event, 'focus');
      case 'explosion':
        return this.playEffectAt(event, 'explosion');
      default:
      // Aucune section ouverte : lecture seule.
    }
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

  protected onPointerMove(event: PointerEvent): void {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    this.hover.set({ x: event.clientX - rect.left, y: event.clientY - rect.top });

    const drag = this.drag();
    const cell = drag && this.toCell(event);
    if (!drag || !cell) return;

    if (drag.kind === 'paint') {
      this.continuePaint(drag, cell);
    } else {
      this.moveFrame(drag, cell);
    }
  }

  protected endDrag(): void {
    this.drag.set(null);
  }

  private startPan(event: PointerEvent): void {
    const start = this.toCell(event);
    const camera = this.boundCamera(this.store.camera());
    if (this.preciseUnavailable() || !start || !camera) return;

    this.capture(event);
    this.drag.set({ kind: 'pan', start, camera });
  }

  private startPaint(event: PointerEvent, mode: 'hide' | 'reveal'): void {
    const cell = this.toCell(event);
    if (!cell) return;
    const size = this.brushSize();
    const strokeId = this.store.beginFogStroke({
      mode,
      style: this.fogStyle(),
      size,
      fade: this.fade(),
      point: toPoint(cell),
    });
    if (!strokeId) return;

    this.capture(event);
    this.drag.set({ kind: 'paint', strokeId, size, last: cell });
  }

  /** Effet sur la case cliquée (hors de la grille : rien). */
  private playEffectAt(event: PointerEvent, tool: 'ping' | 'focus' | 'explosion'): void {
    const cell = this.toCell(event);
    if (!cell || !this.inGrid(cell)) return;
    const [x, y] = toPoint(cell);

    switch (tool) {
      case 'ping':
        return this.playEffect({ kind: 'ping', x, y, color: PING_COLOR });
      case 'focus': {
        const durationMs = this.focusSeconds() * 1000;
        return this.playEffect({ kind: 'focus', camera: this.focusCameraAt({ x, y }), durationMs });
      }
      case 'explosion':
        return this.playEffect({ kind: 'explosion', x, y, radius: this.explosionRadius() });
    }
  }

  /**
   * Caméra visée par un focus, centrée sur le point. Quand la TV montre toute
   * la carte, elle zoome pour n'en montrer que `FOCUS_ZONE` (60 %) ; en mode
   * précis, elle garde son zoom et ne fait que se déplacer.
   */
  private focusCameraAt({ x, y }: CellPoint): Camera {
    const zoom = this.store.preciseView() ? this.store.camera().zoom : 1 / FOCUS_ZONE;
    return { x, y, zoom };
  }

  /** Encadre la zone du focus jusqu'à ce que la TV commence à revenir. */
  private showFocus(camera: Camera, durationMs: number): void {
    const mapId = this.store.selectedMap()?.id;
    if (!mapId) return;
    clearTimeout(this.focusTimer);
    this.activeFocus.set({ mapId, camera });
    this.focusTimer = setTimeout(() => this.activeFocus.set(null), FOCUS_MOVE_MS + durationMs);
  }

  /** Zone de la carte que la TV afficherait avec cette caméra, en pixels de l'aperçu. */
  private boardZone(camera: Camera): PxRect | null {
    const viewport = this.boardViewport();
    const layout = this.previewLayout();
    if (!viewport || !layout) return null;
    const zone = visibleCells(
      viewport.width,
      viewport.height,
      this.store.grid(),
      camera,
      RENDER_STYLES.board.fit,
    );
    return {
      left: layout.originX + zone.x * layout.cellPx,
      top: layout.originY + zone.y * layout.cellPx,
      width: zone.w * layout.cellPx,
      height: zone.h * layout.cellPx,
    };
  }

  private inGrid({ x, y }: CellPoint): boolean {
    const { cols, rows } = this.store.grid();
    return x >= 0 && y >= 0 && x <= cols && y <= rows;
  }

  private continuePaint(drag: Extract<Drag, { kind: 'paint' }>, cell: CellPoint): void {
    const step = drag.size * STROKE_POINT_STEP;
    if (Math.hypot(cell.x - drag.last.x, cell.y - drag.last.y) < step) return;

    this.store.extendFogStroke(drag.strokeId, toPoint(cell));
    this.drag.set({ ...drag, last: cell });
  }

  private moveFrame(drag: Exclude<Drag, { kind: 'paint' }>, cell: CellPoint): void {
    const viewport = this.boardViewport();
    if (!viewport) return;

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

  /** Le glisser continue même si le pointeur sort de l'aperçu. */
  private capture(event: PointerEvent): void {
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  /** Position du pointeur dans l'aperçu, en cases. */
  private toCell(event: PointerEvent): CellPoint | null {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    return this.pxToCell({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  }

  /** Point de l'aperçu (en pixels, depuis son coin haut gauche), en cases. */
  private pxToCell(point: { x: number; y: number }): CellPoint | null {
    const layout = this.previewLayout();
    if (!layout || layout.cellPx === 0) return null;
    return {
      x: (point.x - layout.originX) / layout.cellPx,
      y: (point.y - layout.originY) / layout.cellPx,
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

/** Point d'un tracé, arrondi au centième de case : plus léger à envoyer et sauvegarder. */
function toPoint({ x, y }: CellPoint): [number, number] {
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

function isTextField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches('textarea, input:not([type=range], [type=checkbox], [type=radio], [type=button])'))
  );
}
