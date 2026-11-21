import { Injectable, signal } from '@angular/core';

import type { BoardEvent } from '../../core/models/sync-message.model';

/**
 * Son de chaque effet (fichiers du dossier `assets/` à la racine du projet,
 * servis sous `assets/`). Un effet absent d'ici est muet.
 */
export const EFFECT_SOUNDS: Partial<Record<BoardEvent['kind'], string>> = {
  explosion: 'assets/explosion.mp3',
};

/**
 * Sons des effets, joués par le plateau seul : les deux fenêtres tournent
 * sur le même PC, l'aperçu du MJ ferait entendre chaque son en double.
 *
 * Le navigateur refuse le son tant qu'on n'a pas cliqué dans la fenêtre
 * (le double-clic du plein écran suffit) : `blocked` le signale, pour
 * proposer d'activer le son.
 */
@Injectable()
export class EffectSounds {
  /** Un élément préchargé par son ; chaque lecture en joue une copie (les sons se superposent). */
  private readonly sounds = new Map<string, HTMLAudioElement>();

  private readonly _blocked = signal(false);
  /** Le dernier son a été refusé par le navigateur : un clic dans la fenêtre est nécessaire. */
  readonly blocked = this._blocked.asReadonly();

  /** Charge les sons à l'avance, pour qu'ils partent en même temps que l'effet. */
  preload(): void {
    for (const url of Object.values(EFFECT_SOUNDS)) {
      if (url) this.sound(url);
    }
  }

  play(event: BoardEvent): void {
    const url = EFFECT_SOUNDS[event.kind];
    if (!url) return;

    const audio = this.sound(url).cloneNode() as HTMLAudioElement;
    audio
      .play()
      .then(() => this._blocked.set(false))
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'NotAllowedError') this._blocked.set(true);
        else console.warn(`Impossible de jouer le son ${url}`, err);
      });
  }

  /** Appelé au clic sur « Activer le son » : ce clic suffit au navigateur. */
  unlock(): void {
    this._blocked.set(false);
  }

  private sound(url: string): HTMLAudioElement {
    let audio = this.sounds.get(url);
    if (!audio) {
      audio = new Audio(url);
      audio.preload = 'auto';
      this.sounds.set(url, audio);
    }
    return audio;
  }
}
