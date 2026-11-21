import { Component, computed, inject, input, model, output, signal } from '@angular/core';

import {
  DEFAULT_FOG_FADE,
  FOG_STYLE_LABELS,
  type FogStyle,
} from '../../../core/models/game-state.model';
import type { BoardEvent } from '../../../core/models/sync-message.model';
import { FOG_DARK, FOG_LIGHT } from '../../../renderer/fog-textures';
import { GameStore } from '../state/game.store';
import { VideoControls } from './video-controls';

/**
 * Section ouverte de la barre d'outils. Elle décide de l'outil actif sur
 * l'aperçu : `display` pour déplacer la zone affichée sur la TV, `fog` pour
 * le pinceau, `effects` pour les effets (ping, focus, explosion au clic). Tout fermé (`null`) :
 * aperçu en lecture seule.
 */
export type PreviewSection = 'display' | 'fog' | 'effects';

/** Le pinceau cache la carte (`paint`) ou la dévoile (`erase`). */
export type BrushMode = 'paint' | 'erase';

/**
 * Effet choisi dans la section « Effets » : `ping`, `focus` et `explosion` se
 * jouent au clic sur l'aperçu, `shake` avec le bouton « Secouer le plateau ».
 */
export type EffectTool = 'ping' | 'focus' | 'shake' | 'explosion';

/** Diamètre du cœur du pinceau (entièrement couvert), en cases. */
export const BRUSH_SIZE = { min: 0.5, max: 12, step: 0.5, default: 2 };
/** Largeur du fondu autour du cœur, en cases. */
export const BRUSH_FADE = { min: 0, max: 4, step: 0.5 };
/** Temps passé sur la zone visée par un focus avant le retour, en secondes. */
export const FOCUS_SECONDS = { min: 1, max: 30, step: 1, default: 5 };
/**
 * Hors mode précis, un focus zoome pour montrer cette part de la vue de la TV
 * (en largeur comme en hauteur) ; en mode précis, le zoom ne change pas.
 */
export const FOCUS_ZONE = 0.6;
/** Durée d'une secousse, en secondes. */
export const SHAKE_SECONDS = { min: 0.5, max: 5, step: 0.5, default: 1 };
/** Force d'une secousse, en crans. */
export const SHAKE_FORCE = { min: 1, max: 10, step: 1, default: 4 };
/** Écart maximal du plateau par cran de force, en cases (force 4 : un quart de case). */
const SHAKE_CELLS_PER_FORCE = 0.0625;
/** Rayon d'une explosion, en cases. */
export const EXPLOSION_RADIUS = { min: 1, max: 10, step: 0.5, default: 3 };

const rgb = ([r, g, b]: readonly number[]) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** Pastille de chaque style, aux couleurs du rendu sur la TV. */
const STYLE_SWATCHES: Record<FogStyle, string> = {
  darkness: '#000',
  fog: `radial-gradient(circle at 35% 35%, ${rgb(FOG_LIGHT)}, ${rgb(FOG_DARK)})`,
};

function cells(value: number): string {
  return `${decimal(value)} ${value > 1 ? 'cases' : 'case'}`;
}

/** Nombre à la française : « 1,5 ». */
function decimal(value: number): string {
  return value.toLocaleString('fr-FR');
}

function seconds(value: number): string {
  return `${decimal(value)} s`;
}

const BRUSH_MODES: readonly { id: BrushMode; label: string; hint: string }[] = [
  { id: 'paint', label: 'Peindre', hint: 'Cacher la carte sous du brouillard' },
  { id: 'erase', label: 'Effacer', hint: 'Dévoiler la carte' },
];

const STYLES: readonly FogStyle[] = ['darkness', 'fog'];

/** Effets de la grille, avec leur icône (tracé SVG 24 × 24). */
const EFFECTS: readonly { id: EffectTool; label: string; hint: string; icon: string }[] = [
  {
    id: 'ping',
    label: 'Ping',
    hint: 'Signaler un endroit aux joueurs',
    // Ondes concentriques
    icon: 'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19',
  },
  {
    id: 'focus',
    label: 'Focus',
    hint: 'Amener la TV sur un endroit de la carte',
    // Viseur
    icon: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
  },
  {
    id: 'shake',
    label: 'Secousse',
    hint: 'Faire trembler le plateau',
    // Sismographe
    icon: 'M2 12h4l2-5 3 10 3-8 2 5 1.5-2H22',
  },
  {
    id: 'explosion',
    label: 'Explosion',
    hint: 'Faire exploser un endroit de la carte',
    // Étoile d'explosion
    icon: 'M12 1.5L13.4 7.6L16.8 5.4L15.2 9.6L21.5 8.9L16.6 12L19.2 14.3L15.2 14.4L18.2 20.6L13.4 16.4L12 20.4L10.8 15.8L6.4 19.8L8.3 14.7L4.6 14.4L8 12L2.3 8.8L8.3 9.3L7.3 5.5L10.8 8.2Z',
  },
];

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

        <!-- Effets : attirer l'attention des joueurs sur la TV. -->
        <div
          class="overflow-hidden rounded-md border"
          [class.border-accent]="section() === 'effects'"
          [class.border-border]="section() !== 'effects'"
        >
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between bg-surface-2 px-3 py-2 font-semibold"
            aria-controls="preview-tools-effects"
            [attr.aria-expanded]="section() === 'effects'"
            (click)="toggle('effects')"
          >
            Effets
            <span aria-hidden="true" class="text-muted transition-transform" [class.rotate-90]="section() === 'effects'">
              ›
            </span>
          </button>

          @if (section() === 'effects') {
            <div id="preview-tools-effects" class="grid gap-3 border-t border-border px-3 py-3">
              @if (effectsUnavailable(); as reason) {
                <p class="text-muted">{{ reason }}</p>
              }

              <div role="radiogroup" aria-label="Effet" class="grid grid-cols-2 gap-1.5">
                @for (item of effects; track item.id) {
                  <button
                    type="button"
                    role="radio"
                    class="flex cursor-pointer flex-col items-center gap-1 rounded-md border px-1 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    [class.border-accent]="effect() === item.id"
                    [class.bg-accent]="effect() === item.id"
                    [class.text-white]="effect() === item.id"
                    [class.border-border]="effect() !== item.id"
                    [class.bg-surface-2]="effect() !== item.id"
                    [attr.aria-checked]="effect() === item.id"
                    [disabled]="effectsOff()"
                    [title]="item.hint"
                    (click)="effect.set(item.id)"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 24 24"
                      class="size-6"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    >
                      <path [attr.d]="item.icon" />
                    </svg>
                    {{ item.label }}
                  </button>
                }
              </div>

              <!-- Réglages de l'effet choisi. -->
              <div data-effect-settings class="grid gap-3" [class.opacity-50]="effectsOff()">
                @switch (effect()) {
                  @case ('ping') {
                    <p class="text-xs text-muted">
                      Cliquez sur l'aperçu pour signaler un endroit aux joueurs.
                    </p>
                  }
                  @case ('focus') {
                    <p class="text-xs text-muted">
                      @if (store.preciseView()) {
                        Cliquez sur l'aperçu : la TV s'y déplace en gardant son zoom (mode précis),
                        puis revient à sa vue.
                      } @else {
                        Cliquez sur l'aperçu : la TV zoome sur cet endroit ({{ focusZonePercent }} % de
                        sa vue), puis revient à sa vue.
                      }
                    </p>
                    <label class="grid gap-1" title="Temps passé sur la zone visée, avant que la TV revienne à sa vue">
                      <span class="flex justify-between">
                        Durée
                        <span class="tabular-nums text-muted">{{ seconds(focusSeconds()) }}</span>
                      </span>
                      <input
                        type="range"
                        aria-label="Durée du focus"
                        class="w-full accent-accent"
                        [min]="focusSecondsRange.min"
                        [max]="focusSecondsRange.max"
                        [step]="focusSecondsRange.step"
                        [value]="focusSeconds()"
                        [disabled]="effectsOff()"
                        (input)="focusSeconds.set(sliderValue($event))"
                      />
                    </label>
                  }
                  @case ('shake') {
                    <label class="grid gap-1" title="Durée du tremblement du plateau">
                      <span class="flex justify-between">
                        Durée
                        <span class="tabular-nums text-muted">{{ seconds(shakeSeconds()) }}</span>
                      </span>
                      <input
                        type="range"
                        aria-label="Durée de la secousse"
                        class="w-full accent-accent"
                        [min]="shakeSecondsRange.min"
                        [max]="shakeSecondsRange.max"
                        [step]="shakeSecondsRange.step"
                        [value]="shakeSeconds()"
                        [disabled]="effectsOff()"
                        (input)="shakeSeconds.set(sliderValue($event))"
                      />
                    </label>
                    <label class="grid gap-1" title="Ampleur du tremblement : de léger à violent">
                      <span class="flex justify-between">
                        Force
                        <span class="tabular-nums text-muted">{{ shakeForce() }} / {{ shakeForceRange.max }}</span>
                      </span>
                      <input
                        type="range"
                        aria-label="Force de la secousse"
                        class="w-full accent-accent"
                        [min]="shakeForceRange.min"
                        [max]="shakeForceRange.max"
                        [step]="shakeForceRange.step"
                        [value]="shakeForce()"
                        [disabled]="effectsOff()"
                        (input)="shakeForce.set(sliderValue($event))"
                      />
                    </label>
                    <button
                      type="button"
                      class="btn-primary"
                      title="Faire trembler le plateau sur la TV"
                      [disabled]="effectsOff()"
                      (click)="emitShake()"
                    >
                      Secouer le plateau
                    </button>
                  }
                  @case ('explosion') {
                    <p class="text-xs text-muted">
                      Cliquez sur l'aperçu pour déclencher une explosion, avec feu et fumée.
                    </p>
                    <label class="grid gap-1" title="Rayon de la zone soufflée (cercle sous le pointeur)">
                      <span class="flex justify-between">
                        Rayon
                        <span class="tabular-nums text-muted">{{ cells(explosionRadius()) }}</span>
                      </span>
                      <input
                        type="range"
                        aria-label="Rayon de l'explosion"
                        class="w-full accent-accent"
                        [min]="explosionRadiusRange.min"
                        [max]="explosionRadiusRange.max"
                        [step]="explosionRadiusRange.step"
                        [value]="explosionRadius()"
                        [disabled]="effectsOff()"
                        (input)="explosionRadius.set(sliderValue($event))"
                      />
                    </label>
                  }
                }
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

  /** Effet choisi (ping, focus et explosion se jouent au clic sur l'aperçu). */
  readonly effect = model<EffectTool>('ping');
  /** Temps passé sur la zone visée par un focus, en secondes. */
  readonly focusSeconds = model(FOCUS_SECONDS.default);
  /** Rayon de l'explosion, en cases. */
  readonly explosionRadius = model(EXPLOSION_RADIUS.default);
  /** Pourquoi les effets ne peuvent pas être joués (`null` : ils le peuvent). */
  readonly effectsUnavailable = input<string | null>(null);
  /** « Secouer le plateau » : la secousse à jouer, avec sa durée et sa force. */
  readonly shake = output<Extract<BoardEvent, { kind: 'shake' }>>();

  protected readonly shakeSeconds = signal(SHAKE_SECONDS.default);
  protected readonly shakeForce = signal(SHAKE_FORCE.default);

  protected readonly brushModes = BRUSH_MODES;
  protected readonly styles = STYLES;
  protected readonly styleLabels = FOG_STYLE_LABELS;
  protected readonly swatches = STYLE_SWATCHES;
  protected readonly sizeRange = BRUSH_SIZE;
  protected readonly fadeRange = BRUSH_FADE;
  protected readonly effects = EFFECTS;
  protected readonly focusSecondsRange = FOCUS_SECONDS;
  protected readonly focusZonePercent = Math.round(FOCUS_ZONE * 100);
  protected readonly shakeSecondsRange = SHAKE_SECONDS;
  protected readonly shakeForceRange = SHAKE_FORCE;
  protected readonly explosionRadiusRange = EXPLOSION_RADIUS;
  protected readonly cells = cells;
  protected readonly seconds = seconds;

  protected readonly noMap = computed(() => !this.store.selectedMap());
  /** Type de la carte en édition : une carte animée n'a ni cadrage ni brouillard. */
  protected readonly selectedKind = computed(() => this.store.selectedMap()?.kind ?? 'image');
  protected readonly effectsOff = computed(() => this.effectsUnavailable() !== null);

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

  protected emitShake(): void {
    this.shake.emit({
      kind: 'shake',
      durationMs: this.shakeSeconds() * 1000,
      amplitude: this.shakeForce() * SHAKE_CELLS_PER_FORCE,
    });
  }

  protected sliderValue(event: Event): number {
    return (event.target as HTMLInputElement).valueAsNumber;
  }
}
