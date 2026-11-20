import { Component, computed, inject, input, model } from '@angular/core';

import {
  DEFAULT_FOG_FADE,
  FOG_STYLE_LABELS,
  type FogStyle,
} from '../../../core/models/game-state.model';
import { CLOUD_DARK, CLOUD_LIGHT } from '../../../renderer/fog-textures';
import { GameStore } from '../state/game.store';
import { VideoControls } from './video-controls';

/**
 * Section ouverte de la barre d'outils. Elle décide de l'outil actif sur
 * l'aperçu : `display` pour déplacer la zone affichée sur la TV, `fog` pour
 * le pinceau. Tout fermé (`null`) : aperçu en lecture seule.
 */
export type PreviewSection = 'display' | 'fog';

/** Le pinceau cache la carte (`paint`) ou la dévoile (`erase`). */
export type BrushMode = 'paint' | 'erase';

/** Diamètre du cœur du pinceau (entièrement couvert), en cases. */
export const BRUSH_SIZE = { min: 0.5, max: 12, step: 0.5, default: 2 };
/** Largeur du fondu autour du cœur, en cases. */
export const BRUSH_FADE = { min: 0, max: 4, step: 0.5 };

const gray = (level: number) => {
  const value = Math.round(level * 255);
  return `rgb(${value} ${value} ${value})`;
};

/** Pastille de chaque style, aux couleurs du rendu sur la TV. */
const STYLE_SWATCHES: Record<FogStyle, string> = {
  darkness: '#000',
  fog: `radial-gradient(circle at 35% 35%, ${gray(CLOUD_LIGHT)}, ${gray(CLOUD_DARK)})`,
};

function cells(value: number): string {
  return `${value} ${value > 1 ? 'cases' : 'case'}`;
}

const BRUSH_MODES: readonly { id: BrushMode; label: string; hint: string }[] = [
  { id: 'paint', label: 'Peindre', hint: 'Cacher la carte sous du brouillard' },
  { id: 'erase', label: 'Effacer', hint: 'Dévoiler la carte' },
];

const STYLES: readonly FogStyle[] = ['darkness', 'fog'];

/**
 * Barre d'outils de l'aperçu MJ. Carte fixe : accordéon (une section ouverte
 * à la fois). Vidéo : commandes de lecture. GIF : rien à régler.
 */
@Component({
  selector: 'app-preview-toolbar',
  imports: [VideoControls],
  host: { class: 'grid content-start gap-2 text-sm' },
  template: `
    @switch (selectedKind()) {
      @case ('video') {
        <!-- Vidéo : plein écran, sans cadrage ni brouillard ; le MJ commande la lecture. -->
        <section class="overflow-hidden rounded-md border border-accent">
          <h3 class="bg-surface-2 px-3 py-2 font-semibold">Vidéo</h3>
          <app-video-controls class="border-t border-border px-3 py-3" />
        </section>
      }
      @case ('gif') {
        <p class="rounded-md border border-border px-3 py-3 text-muted">
          GIF animé : il est lu en boucle et remplit tout l'écran de la TV, sans cadrage ni
          brouillard.
        </p>
      }
      @default {
        <!-- Affichage : déplacer et zoomer la zone que montre la TV. -->
        <div
          class="overflow-hidden rounded-md border"
          [class.border-accent]="section() === 'display'"
          [class.border-border]="section() !== 'display'"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between bg-surface-2 px-3 py-2 font-semibold"
            aria-controls="preview-tools-display"
            [attr.aria-expanded]="section() === 'display'"
            (click)="toggle('display')"
          >
            Affichage
            <span aria-hidden="true" class="text-muted transition-transform" [class.rotate-90]="section() === 'display'">
              ›
            </span>
          </button>

          @if (section() === 'display') {
            <div id="preview-tools-display" class="grid gap-3 border-t border-border px-3 py-3">
              <label
                class="flex items-center gap-2"
                [class.cursor-pointer]="viewUnavailable() === null"
                [class.opacity-50]="viewUnavailable() !== null"
                title="Redimensionner le cadre par ses coins pour zoomer sur une partie de la carte"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-accent"
                  [checked]="store.preciseView()"
                  [disabled]="viewUnavailable() !== null"
                  (change)="onPreciseToggle($event)"
                />
                Mode précis
              </label>
            </div>
          }
        </div>

        <!-- Brouillard : le pinceau et ses réglages. -->
        <div
          class="overflow-hidden rounded-md border"
          [class.border-accent]="section() === 'fog'"
          [class.border-border]="section() !== 'fog'"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between bg-surface-2 px-3 py-2 font-semibold"
            aria-controls="preview-tools-fog"
            [attr.aria-expanded]="section() === 'fog'"
            (click)="toggle('fog')"
          >
            Brouillard
            <span aria-hidden="true" class="text-muted transition-transform" [class.rotate-90]="section() === 'fog'">
              ›
            </span>
          </button>

          @if (section() === 'fog') {
            <div id="preview-tools-fog" class="grid gap-3 border-t border-border px-3 py-3">
              @if (noMap()) {
                <p class="text-muted">Sélectionnez une carte pour peindre son brouillard.</p>
              }

              <label
                class="flex items-center gap-2"
                title="Afficher ou masquer le brouillard, sans le perdre"
                [class.cursor-pointer]="!noMap()"
                [class.opacity-50]="noMap()"
              >
                <input
                  type="checkbox"
                  class="size-4 accent-accent"
                  [checked]="store.fog().enabled"
                  [disabled]="noMap()"
                  (change)="onFogToggle($event)"
                />
                Activer
              </label>

              <div role="radiogroup" aria-label="Pinceau" class="flex overflow-hidden rounded-md border border-border">
                @for (mode of brushModes; track mode.id) {
                  <button
                    type="button"
                    role="radio"
                    class="flex-1 cursor-pointer px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                    [class.bg-accent]="brushMode() === mode.id"
                    [class.text-white]="brushMode() === mode.id"
                    [class.bg-surface-2]="brushMode() !== mode.id"
                    [attr.aria-checked]="brushMode() === mode.id"
                    [disabled]="noMap()"
                    [title]="mode.hint"
                    (click)="brushMode.set(mode.id)"
                  >
                    {{ mode.label }}
                  </button>
                }
              </div>

              <div role="radiogroup" aria-label="Style du brouillard" class="flex overflow-hidden rounded-md border border-border">
                @for (style of styles; track style) {
                  <button
                    type="button"
                    role="radio"
                    class="flex flex-1 cursor-pointer items-center justify-center gap-1.5 px-2 py-1 disabled:cursor-not-allowed disabled:opacity-50"
                    [class.bg-accent]="fogStyle() === style"
                    [class.text-white]="fogStyle() === style"
                    [class.bg-surface-2]="fogStyle() !== style"
                    [attr.aria-checked]="fogStyle() === style"
                    [disabled]="noMap()"
                    (click)="fogStyle.set(style)"
                  >
                    <span
                      aria-hidden="true"
                      class="size-3.5 shrink-0 rounded-full border border-white/50"
                      [style.background]="swatches[style]"
                    ></span>
                    {{ styleLabels[style] }}
                  </button>
                }
              </div>

              <label
                class="grid gap-1"
                title="Diamètre du cœur du pinceau, entièrement couvert"
                [class.opacity-50]="noMap()"
              >
                <span class="flex justify-between">
                  Taille
                  <span class="tabular-nums text-muted">{{ cells(brushSize()) }}</span>
                </span>
                <input
                  type="range"
                  aria-label="Taille"
                  class="w-full accent-accent"
                  [min]="sizeRange.min"
                  [max]="sizeRange.max"
                  [step]="sizeRange.step"
                  [value]="brushSize()"
                  [disabled]="noMap()"
                  (input)="onSizeInput($event)"
                />
              </label>

              <label
                class="grid gap-1"
                title="Largeur du fondu autour du cœur, entre le brouillard et la carte visible"
                [class.opacity-50]="noMap()"
              >
                <span class="flex justify-between">
                  Douceur
                  <span class="tabular-nums text-muted">{{ fade() === 0 ? 'bord net' : cells(fade()) }}</span>
                </span>
                <input
                  type="range"
                  aria-label="Douceur"
                  class="w-full accent-accent"
                  [min]="fadeRange.min"
                  [max]="fadeRange.max"
                  [step]="fadeRange.step"
                  [value]="fade()"
                  [disabled]="noMap()"
                  (input)="onFadeInput($event)"
                />
              </label>

              <div class="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  class="btn"
                  title="Cacher toute la carte avec le style choisi"
                  [disabled]="noMap()"
                  (click)="store.fillFog('hide', fogStyle())"
                >
                  Tout couvrir
                </button>
                <button
                  type="button"
                  class="btn"
                  title="Dévoiler toute la carte"
                  [disabled]="noMap()"
                  (click)="store.fillFog('reveal', fogStyle())"
                >
                  Tout dévoiler
                </button>
              </div>
            </div>
          }
        </div>
      }
    }
  `,
})
export class PreviewToolbar {
  protected readonly store = inject(GameStore);

  /** Section ouverte ; `null` : tout est fermé, l'aperçu est en lecture seule. */
  readonly section = model<PreviewSection | null>(null);
  readonly brushMode = model<BrushMode>('paint');
  readonly fogStyle = model<FogStyle>('darkness');
  readonly brushSize = model(BRUSH_SIZE.default);
  /** Largeur du fondu autour du cœur, en cases (0 : bord net). */
  readonly fade = model(DEFAULT_FOG_FADE);
  /** Pourquoi la zone affichée sur la TV ne peut pas être réglée (`null` : elle peut l'être). */
  readonly viewUnavailable = input<string | null>(null);

  protected readonly brushModes = BRUSH_MODES;
  protected readonly styles = STYLES;
  protected readonly styleLabels = FOG_STYLE_LABELS;
  protected readonly swatches = STYLE_SWATCHES;
  protected readonly sizeRange = BRUSH_SIZE;
  protected readonly fadeRange = BRUSH_FADE;
  protected readonly cells = cells;

  protected readonly noMap = computed(() => !this.store.selectedMap());
  /** Type de la carte en édition : une carte animée n'a ni cadrage ni brouillard. */
  protected readonly selectedKind = computed(() => this.store.selectedMap()?.kind ?? 'image');

  /** Ouvre une section (et ferme l'autre), ou la referme si elle était ouverte. */
  protected toggle(section: PreviewSection): void {
    this.section.update((open) => (open === section ? null : section));
  }

  protected onFogToggle(event: Event): void {
    this.store.setFogEnabled((event.target as HTMLInputElement).checked);
  }

  protected onPreciseToggle(event: Event): void {
    this.store.setPreciseView((event.target as HTMLInputElement).checked);
  }

  protected onSizeInput(event: Event): void {
    this.brushSize.set((event.target as HTMLInputElement).valueAsNumber);
  }

  protected onFadeInput(event: Event): void {
    this.fade.set((event.target as HTMLInputElement).valueAsNumber);
  }
}
