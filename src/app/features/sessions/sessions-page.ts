import { Component, ElementRef, effect, inject, resource, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AssetRepository } from '../../core/persistence/asset.repository';
import {
  SESSION_NAME_MAX_LENGTH,
  SessionRepository,
  type SessionSummary,
} from '../../core/persistence/session.repository';

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

function count(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? 's' : ''}`;
}

/**
 * Écran d'accueil : les sessions de jeu. Cliquer une session l'ouvre dans la
 * vue MJ (/dm/:id) ; on peut aussi en créer, en renommer et en supprimer.
 */
@Component({
  selector: 'app-sessions-page',
  imports: [RouterLink],
  host: { class: 'mx-auto block max-w-3xl px-6 py-8' },
  template: `
    <header class="mb-6 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Sessions</h1>
        <p class="text-sm text-muted">Choisissez la partie à ouvrir dans la vue MJ.</p>
      </div>
      @if (!creating()) {
        <button type="button" class="btn-primary shrink-0" (click)="startCreating()">
          + Nouvelle session
        </button>
      }
    </header>

    @if (creating()) {
      <form
        class="panel mb-4 flex flex-wrap items-center gap-2 p-3"
        (submit)="create($event)"
        (keydown.escape)="creating.set(false)"
      >
        <label class="sr-only" for="new-session-name">Nom de la nouvelle session</label>
        <input
          #newName
          id="new-session-name"
          name="name"
          required
          class="field min-w-0 flex-1"
          placeholder="Nom de la session"
          [maxLength]="maxLength"
        />
        <button type="submit" class="btn-primary">Créer</button>
        <button type="button" class="btn" (click)="creating.set(false)">Annuler</button>
      </form>
    }

    @if (error(); as message) {
      <p role="alert" class="mb-4 text-sm text-danger">{{ message }}</p>
    }

    @if (sessions.hasValue()) {
      @if (sessions.value().length) {
        <ul class="grid gap-2">
          @for (session of sessions.value(); track session.id) {
            <li class="panel flex items-center gap-2 p-3">
              @if (editingId() === session.id) {
                <form
                  class="flex flex-1 flex-wrap items-center gap-2"
                  (submit)="rename(session, $event)"
                  (keydown.escape)="editingId.set(null)"
                >
                  <label class="sr-only" [for]="'rename-' + session.id">Nouveau nom</label>
                  <input
                    #renameInput
                    name="name"
                    required
                    class="field min-w-0 flex-1"
                    [id]="'rename-' + session.id"
                    [value]="session.name"
                    [maxLength]="maxLength"
                  />
                  <button type="submit" class="btn-primary">Enregistrer</button>
                  <button type="button" class="btn" (click)="editingId.set(null)">Annuler</button>
                </form>
              } @else {
                <a
                  class="min-w-0 flex-1 rounded-md px-1 py-0.5 hover:text-accent"
                  [routerLink]="['/dm', session.id]"
                >
                  <span class="block truncate font-semibold">{{ session.name }}</span>
                  <span class="block text-sm text-muted">{{ describe(session) }}</span>
                </a>
                <button
                  type="button"
                  class="btn"
                  title="Renommer"
                  [attr.aria-label]="'Renommer ' + session.name"
                  (click)="editingId.set(session.id)"
                >
                  ✎
                </button>
                <button
                  type="button"
                  class="btn btn-danger"
                  title="Supprimer"
                  [attr.aria-label]="'Supprimer ' + session.name"
                  (click)="remove(session)"
                >
                  ✕
                </button>
              }
            </li>
          }
        </ul>
      } @else {
        <p class="text-muted">Aucune session pour l'instant : créez-en une pour commencer.</p>
      }
    } @else if (sessions.error()) {
      <p role="alert" class="text-sm text-danger">Impossible de lire les sessions enregistrées.</p>
    } @else {
      <p class="text-muted">Chargement…</p>
    }
  `,
})
export class SessionsPage {
  private readonly repository = inject(SessionRepository);
  private readonly assets = inject(AssetRepository);

  protected readonly maxLength = SESSION_NAME_MAX_LENGTH;
  protected readonly sessions = resource({ loader: () => this.repository.list() });
  protected readonly creating = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly newNameInput = viewChild<ElementRef<HTMLInputElement>>('newName');
  private readonly renameInput = viewChild<ElementRef<HTMLInputElement>>('renameInput');

  constructor() {
    // Le champ qui vient d'apparaître reçoit le focus ; on renomme en partant du nom actuel.
    effect(() => this.newNameInput()?.nativeElement.focus());
    effect(() => this.renameInput()?.nativeElement.select());
  }

  protected describe(session: SessionSummary): string {
    const parts = [count(session.mapCount, 'carte'), count(session.playerCount, 'joueur')];
    return `${parts.join(' · ')} · modifiée le ${DATE_FORMAT.format(session.updatedAt)}`;
  }

  protected startCreating(): void {
    this.editingId.set(null);
    this.creating.set(true);
  }

  protected async create(event: Event): Promise<void> {
    const name = submittedName(event);
    if (!name) return;
    await this.attempt('Impossible de créer la session.', async () => {
      await this.repository.create(name);
      this.creating.set(false);
    });
  }

  protected async rename(session: SessionSummary, event: Event): Promise<void> {
    const name = submittedName(event);
    if (!name) return;
    await this.attempt('Impossible de renommer la session.', async () => {
      if (name !== session.name) await this.repository.rename(session.id, name);
      this.editingId.set(null);
    });
  }

  protected async remove(session: SessionSummary): Promise<void> {
    const question = `Supprimer la session « ${session.name} » ? Ses cartes, son brouillard et ses joueurs seront perdus.`;
    if (!confirm(question)) return;
    await this.attempt('Impossible de supprimer la session.', async () => {
      await this.repository.delete(session.id);
      // Ses images ne servent peut-être plus à aucune autre session.
      void this.pruneAssets();
    });
  }

  /** Exécute une modification, recharge la liste, et signale un éventuel échec. */
  private async attempt(failure: string, action: () => Promise<void>): Promise<void> {
    this.error.set(null);
    try {
      await action();
    } catch (err) {
      console.error(failure, err);
      this.error.set(failure);
    }
    this.sessions.reload();
  }

  private async pruneAssets(): Promise<void> {
    try {
      await this.assets.deleteUnused(await this.repository.usedAssetIds());
    } catch (err) {
      console.error('Échec du nettoyage des fichiers importés', err);
    }
  }
}

/** Nom saisi dans le formulaire envoyé, sans espaces superflus (`''` s'il est vide). */
function submittedName(event: Event): string {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  return String(new FormData(form).get('name') ?? '').trim();
}
