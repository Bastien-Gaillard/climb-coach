import type { PushAlert } from '../db/schema';

/** Au-delà, une alerte en retard (API arrêtée, téléphone injoignable) n'a plus de sens. */
export const STALE_AFTER_MS = 2 * 60_000;

/** Nombre maximal d'alertes gardées pour un appareil : une séance a rarement plus de 6 blocs. */
export const MAX_ALERTS = 20;

/**
 * Sépare les alertes dues des suivantes. Si plusieurs sont dues d'un coup (API redémarrée),
 * seule la plus récente part, et seulement si elle n'est pas périmée.
 */
export function takeDue(
  alerts: readonly PushAlert[],
  now: number,
): { send: PushAlert | null; rest: PushAlert[] } {
  const sorted = [...alerts].sort((a, b) => a.at - b.at);
  const due = sorted.filter((a) => a.at <= now);
  const rest = sorted.filter((a) => a.at > now);
  const last = due.at(-1) ?? null;
  return { send: last && now - last.at <= STALE_AFTER_MS ? last : null, rest };
}

/** Garde les alertes à venir, triées, sans dépasser MAX_ALERTS. */
export function upcoming(alerts: readonly PushAlert[], now: number): PushAlert[] {
  return alerts
    .filter((a) => a.at > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_ALERTS);
}
