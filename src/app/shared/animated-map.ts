import {
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  resource,
  signal,
  untracked,
  viewChild,
} from '@angular/core';

import type { AnimatedMapView } from '../core/models/board-view.model';
import {
  hasEnded,
  positionGap,
  videoPosition,
  type VideoPlayback,
} from '../core/models/video-playback';
import { AssetRepository } from '../core/persistence/asset.repository';

/** Écart toléré avant de recaler la vidéo sur la position voulue (s). */
const DRIFT_TOLERANCE = 0.3;
/** Fréquence du recalage pendant la lecture (ms). */
const RESYNC_INTERVAL_MS = 1000;

/**
 * Carte animée, sur la TV (plein écran) ou dans l'aperçu du MJ.
 *
 * - GIF : affiché tel quel, le navigateur l'anime en boucle.
 * - Vidéo : lue par cette fenêtre et calée sur l'état commandé par le MJ
 *   (lecture, pause, position, boucle, son), à chaque changement puis
 *   régulièrement pour corriger la dérive.
 *
 * Si le navigateur refuse le son (aucun clic dans la fenêtre), la vidéo
 * continue en muet et un bouton propose d'activer le son.
 */
@Component({
  selector: 'app-animated-map',
  host: { class: 'block overflow-hidden bg-black' },
  template: `
    @if (url(); as url) {
      @if (media().kind === 'gif') {
        <img
          [src]="url"
          alt=""
          class="size-full"
          [class.object-cover]="fit() === 'cover'"
          [class.object-contain]="fit() === 'contain'"
        />
      } @else {
        <video
          #video
          [src]="url"
          playsinline
          disablepictureinpicture
          class="size-full"
          [class.object-cover]="fit() === 'cover'"
          [class.object-contain]="fit() === 'contain'"
          (loadedmetadata)="ready.set(true)"
          (emptied)="ready.set(false)"
        ></video>
      }
    }

    @if (soundBlocked()) {
      <button
        type="button"
        class="absolute bottom-6 left-1/2 -translate-x-1/2 cursor-pointer rounded-full border-2 border-white bg-black/80 px-5 py-2 text-lg font-semibold text-white"
        (click)="unlockSound()"
      >
        🔇 Activer le son
      </button>
    }
  `,
})
export class AnimatedMap {
  readonly media = input.required<AnimatedMapView>();
  /** `cover` remplit l'écran (TV), `contain` montre tout (aperçu). */
  readonly fit = input<'cover' | 'contain'>('cover');
  /** Le son suit la commande du MJ (TV) ; sinon la vidéo reste muette (aperçu). */
  readonly withSound = input(false);

  private readonly assets = inject(AssetRepository);
  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');

  protected readonly ready = signal(false);
  /** Le navigateur a refusé de lire le son : un clic dans la fenêtre est nécessaire. */
  protected readonly soundBlocked = signal(false);
  protected readonly url = signal<string | null>(null);

  private readonly blob = resource({
    params: () => this.media().assetId,
    loader: ({ params }) => this.assets.getBlob(params),
  });

  constructor() {
    // Une URL blob: par fichier, libérée quand il change ou que la carte disparaît.
    effect((onCleanup) => {
      const blob = this.blob.hasValue() ? this.blob.value() : null;
      if (!blob) {
        this.url.set(null);
        return;
      }
      const url = URL.createObjectURL(blob);
      this.url.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });

    // Chaque commande du MJ est appliquée tout de suite.
    effect(() => {
      const video = this.videoRef()?.nativeElement;
      const playback = this.media().playback;
      const withSound = this.withSound();
      if (!video || !playback || !this.ready()) return;
      untracked(() => this.sync(video, playback, withSound));
    });

    // Puis régulièrement, pour corriger la dérive entre les fenêtres.
    const timer = setInterval(() => {
      const video = this.videoRef()?.nativeElement;
      const playback = this.media().playback;
      if (video && playback?.playing && this.ready()) this.sync(video, playback, this.withSound());
    }, RESYNC_INTERVAL_MS);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  /** Clic sur la TV : le navigateur autorise alors le son. */
  protected unlockSound(): void {
    const video = this.videoRef()?.nativeElement;
    this.soundBlocked.set(false);
    if (!video) return;
    video.muted = false;
    void video.play().catch(() => this.soundBlocked.set(true));
  }

  private sync(video: HTMLVideoElement, playback: VideoPlayback, withSound: boolean): void {
    const now = Date.now();
    const duration = Number.isFinite(video.duration) ? video.duration : null;
    const target = videoPosition(playback, now, duration);

    video.loop = playback.loop;
    video.volume = Math.min(1, Math.max(0, playback.volume));
    if (positionGap(video.currentTime, target, duration, playback.loop) > DRIFT_TOLERANCE) {
      video.currentTime = target;
    }

    const muted = !withSound || playback.muted;
    if (muted) this.soundBlocked.set(false);

    if (!playback.playing || hasEnded(playback, now, duration)) {
      video.pause();
      return;
    }
    // Son refusé en attendant un clic : on continue en muet.
    video.muted = muted || this.soundBlocked();
    if (video.paused) this.play(video, muted);
  }

  private play(video: HTMLVideoElement, muted: boolean): void {
    video.play().catch((err: unknown) => {
      const refused = err instanceof DOMException && err.name === 'NotAllowedError';
      if (!refused || muted) return;
      this.soundBlocked.set(true);
      video.muted = true;
      void video.play().catch(() => undefined);
    });
  }
}
