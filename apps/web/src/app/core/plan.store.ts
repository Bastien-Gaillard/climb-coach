import { Injectable, signal } from '@angular/core';
import { Focus, GeneratedPlan } from './models';

const KEY = 'climb-coach.plan';

/** Position du minuteur : bloc en cours, secondes restantes à l'instant `at`. */
export interface TimerState {
  index: number;
  left: number;
  running: boolean;
  at: number;
}

interface Saved {
  plan: GeneratedPlan;
  startedAt: number | null;
  timer?: TimerState | null;
}

function read(): Saved | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

/**
 * Dernière séance générée, partagée entre « Générer », « Séance en cours » et la saisie.
 * Gardée dans sessionStorage pour survivre à un rechargement en pleine séance.
 */
@Injectable({ providedIn: 'root' })
export class PlanStore {
  private readonly saved = read();

  readonly plan = signal<GeneratedPlan | null>(this.saved?.plan ?? null);
  /** Début de la séance guidée (ms), null tant qu'elle n'est pas démarrée. */
  readonly startedAt = signal<number | null>(this.saved?.startedAt ?? null);

  /**
   * Position du minuteur, sauvegardée à chaque changement : on reprend au même endroit après
   * « + Voie », un rechargement, ou un onglet tué par le téléphone pendant la veille.
   */
  readonly timer = signal<TimerState | null>(this.saved?.timer ?? null);

  set(plan: GeneratedPlan | null): void {
    this.plan.set(plan);
    this.startedAt.set(null);
    this.timer.set(null);
    this.persist();
  }

  saveTimer(state: TimerState): void {
    this.timer.set(state);
    this.persist();
  }

  start(): void {
    if (this.startedAt() === null) this.startedAt.set(Date.now());
    this.persist();
  }

  /** Minutes écoulées depuis le démarrage (arrondies à 5), pour pré-remplir la saisie. */
  elapsedMinutes(now = Date.now()): number | null {
    const start = this.startedAt();
    if (start === null) return null;
    const minutes = Math.max(10, Math.round((now - start) / 60000 / 5) * 5);
    // Séance démarrée il y a très longtemps (onglet oublié) : la durée n'a plus de sens
    return minutes <= 300 ? minutes : null;
  }

  focus(): Focus | null {
    return this.startedAt() !== null ? (this.plan()?.plan.focus ?? null) : null;
  }

  /** Séance enregistrée : on oublie le plan suivi. */
  finish(): void {
    this.set(null);
  }

  private persist(): void {
    try {
      const plan = this.plan();
      if (plan)
        sessionStorage.setItem(
          KEY,
          JSON.stringify({ plan, startedAt: this.startedAt(), timer: this.timer() }),
        );
      else sessionStorage.removeItem(KEY);
    } catch {
      // stockage indisponible (navigation privée) : on garde juste l'état en mémoire
    }
  }
}
