import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { GeneratedPlan } from './models';
import { PlanStore, TimerState } from './plan.store';

/** Fin de bloc à annoncer : heure (ms), titre et texte de la notification. */
export interface PushAlert {
  at: number;
  title: string;
  body: string;
}

/**
 * - `unsupported` : navigateur sans notifications push ;
 * - `unavailable` : serveur sans clés VAPID, ou erreur à l'abonnement ;
 * - `ask` : il faut encore autoriser les notifications (bouton) ;
 * - `denied` : refusées dans le navigateur ;
 * - `on` : les fins de bloc sont annoncées.
 */
export type PushState = 'unsupported' | 'unavailable' | 'ask' | 'denied' | 'on';

/** Petite vibration de fin de bloc. */
export const VIBRATION = [200, 100, 200];

const SW_URL = '/push-sw.js';

/** Fins de bloc à venir d'après la position du minuteur (aucune quand il est en pause). */
export function alertsFor(plan: GeneratedPlan | null, timer: TimerState | null): PushAlert[] {
  const blocks = plan?.plan.blocks ?? [];
  if (!timer?.running || !blocks.length) return [];
  const alerts: PushAlert[] = [];
  let end = timer.at + timer.left * 1000;
  for (let i = timer.index; i < blocks.length; i++) {
    if (i > timer.index) end += blocks[i].minutes * 60_000;
    const next = blocks[i + 1];
    alerts.push(
      next
        ? {
            at: end,
            title: `Fin du bloc « ${blocks[i].title} »`,
            body: `Ensuite : ${next.title} · ${next.minutes} min`,
          }
        : { at: end, title: 'Fin de séance', body: 'Pense à noter tes blocs.' },
    );
  }
  return alerts;
}

/** Fait vibrer le téléphone (Android) ; sans effet ailleurs. */
export function vibrate(pattern: number[] = VIBRATION): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // vibration refusée (pas encore de geste de l'utilisateur sur la page)
  }
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Notifications de fin de bloc. Le téléphone s'abonne une fois ; ensuite, à chaque changement
 * du minuteur (départ, pause, bloc sauté, séance finie), on envoie à l'API la liste des fins de
 * bloc à venir. C'est l'API qui pousse la notification à l'heure dite : elle arrive même
 * téléphone verrouillé, quand la page ne tourne plus.
 */
@Injectable({ providedIn: 'root' })
export class PushAlerts {
  private readonly http = inject(HttpClient);
  private readonly store = inject(PlanStore);

  readonly state = signal<PushState>('unsupported');
  /** Séance fermée (croix, « Terminer ») : plus d'alertes jusqu'au retour sur le minuteur. */
  private readonly stopped = signal(false);

  private setup: Promise<void> | null = null;
  private key: Uint8Array<ArrayBuffer> | null = null;
  private endpoint: string | null = null;
  /** Dernière liste envoyée, pour ne pas renvoyer la même à chaque sauvegarde du minuteur. */
  private lastSent: string | null = null;
  /** Envois mis en file : l'API reçoit toujours la dernière liste en dernier. */
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    effect(() => {
      const alerts = this.stopped() ? [] : alertsFor(this.store.plan(), this.store.timer());
      if (this.state() === 'on') this.queue = this.queue.then(() => this.send(alerts));
    });
  }

  /** Prépare les notifications (une seule fois) : service worker, permission, abonnement. */
  init(): Promise<void> {
    return (this.setup ??= this.prepare());
  }

  /** Demande l'autorisation : à appeler depuis un geste de l'utilisateur (bouton). */
  async enable(): Promise<void> {
    await this.init();
    if (this.state() !== 'ask') return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') await this.subscribe();
    else this.state.set(permission === 'denied' ? 'denied' : 'ask');
  }

  /** Retour sur le minuteur : les alertes reprennent. */
  resume(): void {
    this.stopped.set(false);
  }

  /** On quitte la séance guidée : on annule les alertes à venir. */
  stop(): void {
    this.stopped.set(true);
  }

  private async prepare(): Promise<void> {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      this.state.set('unsupported');
      return;
    }
    try {
      const { publicKey } = await firstValueFrom(
        this.http.get<{ publicKey: string | null }>('/api/push/key'),
      );
      if (!publicKey) {
        this.state.set('unavailable');
        return;
      }
      this.key = base64UrlToBytes(publicKey);
      await navigator.serviceWorker.register(SW_URL);
      const permission = Notification.permission;
      if (permission === 'granted') await this.subscribe();
      else this.state.set(permission === 'denied' ? 'denied' : 'ask');
    } catch {
      this.state.set('unavailable');
    }
  }

  private async subscribe(): Promise<void> {
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      // Clés VAPID changées sur le serveur : l'ancien abonnement ne marche plus
      if (sub && !sameKey(sub.options.applicationServerKey, this.key!)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.key!,
      });
      await firstValueFrom(this.http.post<void>('/api/push/subscribe', sub.toJSON()));
      this.endpoint = sub.endpoint;
      this.lastSent = null;
      this.state.set('on');
    } catch {
      this.state.set('unavailable');
    }
  }

  private async send(alerts: PushAlert[], retry = true): Promise<void> {
    const json = JSON.stringify(alerts);
    if (!this.endpoint || json === this.lastSent) return;
    this.lastSent = json;
    try {
      await firstValueFrom(this.http.put('/api/push/alerts', { endpoint: this.endpoint, alerts }));
    } catch (err) {
      this.lastSent = null;
      // Abonnement oublié par le serveur (base vidée, autre compte) : on se réabonne une fois
      if (retry && err instanceof HttpErrorResponse && err.status === 404) {
        await this.subscribe();
        await this.send(alerts, false);
      }
    }
  }
}
