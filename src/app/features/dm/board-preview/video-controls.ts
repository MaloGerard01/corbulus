import { Component, DestroyRef, computed, inject, resource, signal } from '@angular/core';

import {
  formatDuration,
  hasEnded,
  isKnownDuration,
  loopPlayback,
  pausePlayback,
  resumePlayback,
  seekPlayback,
  videoPosition,
  type VideoPlayback,
} from '../../../core/models/video-playback';
import { AssetRepository } from '../../../core/persistence/asset.repository';
import { GameStore } from '../state/game.store';

/** Rafraîchissement de la position affichée (ms). */
const TICK_MS = 250;

/**
 * Commandes de la vidéo en édition : son, lecture / pause, position, boucle.
 * Elles modifient l'état de lecture ; la TV (et l'aperçu) le reproduisent.
 */
@Component({
  selector: 'app-video-controls',
  host: { class: 'grid gap-3 text-sm' },
  template: `
    @if (playback(); as playback) {
      <!-- Le son est l'action la plus visible : il part sur les enceintes de la TV. -->
      <button
        type="button"
        data-sound
        class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border-2 px-3 py-2.5 text-base font-semibold"
        [class]="
          playback.muted
            ? 'border-amber-400 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
            : 'border-accent bg-accent text-white hover:brightness-110'
        "
        [attr.aria-pressed]="!playback.muted"
        (click)="toggleSound(playback)"
      >
        <span aria-hidden="true" class="text-xl">{{ playback.muted ? '🔇' : '🔊' }}</span>
        {{ playback.muted ? 'Son coupé : activer sur la TV' : 'Son activé sur la TV' }}
      </button>

      <label
        class="grid gap-1"
        [class.opacity-50]="playback.muted"
        [title]="playback.muted ? 'Volume appliqué quand le son sera activé' : 'Volume du son sur la TV'"
      >
        <span class="flex justify-between">
          Volume
          <span class="tabular-nums text-muted">{{ volumePercent() }} %</span>
        </span>
        <input
          type="range"
          aria-label="Volume"
          class="w-full accent-accent"
          min="0"
          max="100"
          step="5"
          [value]="volumePercent()"
          (input)="onVolumeInput(playback, $event)"
        />
      </label>

      <div class="flex items-center gap-3">
        <button
          type="button"
          class="btn-primary min-w-24"
          [attr.aria-label]="isPlaying() ? 'Pause' : 'Lecture'"
          (click)="togglePlay(playback)"
        >
          {{ isPlaying() ? '❚❚ Pause' : '▶ Lecture' }}
        </button>
        <span class="tabular-nums text-muted">
          {{ format(position()) }} / {{ duration() === null ? '--:--' : format(duration()!) }}
        </span>
      </div>

      <input
        type="range"
        aria-label="Position dans la vidéo"
        class="w-full accent-accent"
        min="0"
        step="0.1"
        [max]="duration() ?? 0"
        [value]="position()"
        [disabled]="duration() === null"
        (input)="onScrub($event)"
        (change)="onSeek(playback, $event)"
      />

      <label class="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          class="size-4 accent-accent"
          [checked]="playback.loop"
          (change)="onLoopToggle(playback, $event)"
        />
        En boucle
      </label>
    }
  `,
})
export class VideoControls {
  private readonly store = inject(GameStore);
  private readonly assets = inject(AssetRepository);

  protected readonly playback = computed(() => this.store.selectedMap()?.playback ?? null);

  private readonly info = resource({
    params: () => this.store.selectedMap()?.assetId,
    loader: ({ params }) => this.assets.getInfo(params),
  });
  /** Durée en secondes, `null` si la vidéo ne l'annonce pas. */
  protected readonly duration = computed(() => {
    const duration = this.info.hasValue() ? (this.info.value()?.duration ?? null) : null;
    return isKnownDuration(duration) ? duration : null;
  });

  private readonly now = signal(Date.now());
  /** Position choisie pendant qu'on fait glisser la barre (pas encore envoyée). */
  private readonly scrubbing = signal<number | null>(null);

  protected readonly position = computed(() => {
    const scrub = this.scrubbing();
    const playback = this.playback();
    if (scrub !== null) return scrub;
    return playback ? videoPosition(playback, this.now(), this.duration()) : 0;
  });

  protected readonly isPlaying = computed(() => {
    const playback = this.playback();
    return !!playback?.playing && !hasEnded(playback, this.now(), this.duration());
  });

  protected readonly format = formatDuration;

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), TICK_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly volumePercent = computed(() =>
    Math.round((this.playback()?.volume ?? 1) * 100),
  );

  protected toggleSound(playback: VideoPlayback): void {
    this.store.setPlayback({ ...playback, muted: !playback.muted });
  }

  /** En direct : la TV suit le curseur (changer le volume ne fait pas sauter la vidéo). */
  protected onVolumeInput(playback: VideoPlayback, event: Event): void {
    const volume = (event.target as HTMLInputElement).valueAsNumber / 100;
    this.store.setPlayback({ ...playback, volume });
  }

  protected togglePlay(playback: VideoPlayback): void {
    const now = Date.now();
    this.store.setPlayback(
      this.isPlaying()
        ? pausePlayback(playback, now, this.duration())
        : resumePlayback(playback, now, this.duration()),
    );
  }

  protected onScrub(event: Event): void {
    this.scrubbing.set((event.target as HTMLInputElement).valueAsNumber);
  }

  /** Au relâchement seulement : la TV ne saute qu'une fois. */
  protected onSeek(playback: VideoPlayback, event: Event): void {
    const position = (event.target as HTMLInputElement).valueAsNumber;
    this.scrubbing.set(null);
    this.store.setPlayback(seekPlayback(playback, position, Date.now()));
  }

  protected onLoopToggle(playback: VideoPlayback, event: Event): void {
    const loop = (event.target as HTMLInputElement).checked;
    this.store.setPlayback(loopPlayback(playback, loop, Date.now(), this.duration()));
  }
}
