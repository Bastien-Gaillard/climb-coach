import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AiStatus } from './models';

/** Une saturation passagère n'est plus signalée au-delà (le quota, lui, reste affiché). */
const TRANSIENT_MS = 15 * 60 * 1000;
const DISMISSED_KEY = 'climb-coach.ai-banner-dismissed';

export interface AiBannerInfo {
  /** Identifiant de la panne en cours : une bannière fermée revient pour une nouvelle panne. */
  key: string;
  title: string;
  text: string;
  severe: boolean;
}

/** Suit l'état de Mistral pour prévenir quand le quota est atteint. */
@Injectable({ providedIn: 'root' })
export class AiStatusStore {
  private readonly api = inject(ApiService);
  readonly status = signal<AiStatus | null>(null);
  private readonly dismissed = signal<string | null>(readDismissed());

  readonly banner = computed<AiBannerInfo | null>(() => {
    const s = this.status();
    if (!s?.enabled || s.state === 'ok') return null;
    const key = `${s.state}|${s.since ?? ''}`;
    if (this.dismissed() === key) return null;
    const age = s.since ? Date.now() - new Date(s.since).getTime() : 0;
    if (s.state !== 'quota_exceeded' && age > TRANSIENT_MS) return null;

    const time = s.since
      ? new Date(s.since).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : null;
    switch (s.state) {
      case 'quota_exceeded':
        return {
          key,
          severe: true,
          title: 'Quota Mistral atteint',
          text: `Depuis ${time ?? 'peu'}, les séances et le planning sont calculés par les règles. Vérifie ton quota ou ta limite de dépenses sur admin.mistral.ai.`,
        };
      case 'rate_limited':
        return {
          key,
          severe: false,
          title: 'Mistral est saturé',
          text: 'Trop de demandes en peu de temps : les règles prennent le relais quelques minutes.',
        };
      default:
        return {
          key,
          severe: false,
          title: 'Mistral ne répond pas',
          text: 'Les règles prennent le relais en attendant.',
        };
    }
  });

  refresh(): void {
    this.api.aiStatus().subscribe({
      next: (s) => this.status.set(s),
      error: () => undefined, // l'API injoignable a déjà ses propres messages
    });
  }

  dismiss(): void {
    const b = this.banner();
    if (!b) return;
    this.dismissed.set(b.key);
    try {
      sessionStorage.setItem(DISMISSED_KEY, b.key);
    } catch {
      // stockage indisponible : la bannière reste fermée pour cette visite
    }
  }
}

function readDismissed(): string | null {
  try {
    return sessionStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}
