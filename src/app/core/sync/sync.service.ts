import { DestroyRef, Injectable, inject } from '@angular/core';
import { Observable, Subject, filter } from 'rxjs';

import type {
  SyncMessage,
  SyncMessageOf,
  SyncMessageType,
} from '../models/sync-message.model';

const CHANNEL_NAME = 'table-jdr';

/**
 * Transport entre la vue MJ et le plateau (deux fenêtres, même origine).
 * Si un jour le MJ passe sur une autre machine, seul ce service change
 * (WebSocket, Mercure…) : le reste de l'app ne voit que send() / on().
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly channel = new BroadcastChannel(CHANNEL_NAME);
  private readonly messages$ = new Subject<SyncMessage>();

  constructor() {
    this.channel.onmessage = (event: MessageEvent<SyncMessage>) => {
      this.messages$.next(event.data);
    };

    inject(DestroyRef).onDestroy(() => {
      this.channel.close();
      this.messages$.complete();
    });
  }

  /** Un BroadcastChannel ne reçoit jamais ses propres messages. */
  send(message: SyncMessage): void {
    this.channel.postMessage(message);
  }

  on<T extends SyncMessageType>(type: T): Observable<SyncMessageOf<T>> {
    return this.messages$.pipe(
      filter((message): message is SyncMessageOf<T> => message.type === type),
    );
  }
}
