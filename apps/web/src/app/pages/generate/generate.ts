import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import {
  BLOCK_LABEL,
  dayDate,
  durationLabel,
  errorMessage,
  FOCUS_LABEL,
  relativeDay,
  STYLE_LABEL,
} from '../../core/labels';
import { Gym, PlannedSession, Schedule, Session } from '../../core/models';
import { PlanStore } from '../../core/plan.store';
import { Figure } from '../../shared/figure';
import { blockFigures } from '../../shared/figures';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';

const MIN = 30;
/** Dernière salle choisie, retenue d'une fois sur l'autre. */
const GYM_KEY = 'climb-coach.gym';
const MAX = 300;

@Component({
  selector: 'app-generate',
  imports: [DatePipe, RouterLink, Icon, Figure],
  templateUrl: './generate.html',
  styleUrl: './generate.scss',
})
export class GeneratePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly store = inject(PlanStore);

  protected readonly presets = [45, 60, 90, 120];
  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly blockLabel = BLOCK_LABEL;
  protected readonly today = new Date();
  protected readonly holdVars = holdVars;

  protected readonly gyms = signal<Gym[]>([]);
  protected readonly gymId = signal<string | null>(readGym());

  protected readonly minutes = signal(90);
  /** Valeur du champ « Autre durée » (n'écrase pas les préréglages tant qu'on n'y touche pas). */
  protected readonly custom = signal(75);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = this.store.plan;
  protected readonly last = signal<Session | null>(null);
  /** Prochaine séance conseillée par le planning (jour, type, durée idéale). */
  protected readonly advice = signal<PlannedSession | null>(null);
  protected readonly adviceSource = signal<Schedule['source']>('rules');
  protected readonly advicePending = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  /** Durée choisie à la main : la suggestion ne l'écrase plus. */
  private touched = false;
  protected readonly durationLabel = durationLabel;
  protected readonly relativeDay = relativeDay;
  protected readonly dayDate = dayDate;

  /** Schéma de chaque consigne, bloc par bloc. */
  protected readonly figures = computed(() => {
    const p = this.result()?.plan;
    return p ? p.blocks.map((b) => blockFigures(b, p.focus)) : [];
  });

  protected readonly total = computed(
    () => this.result()?.plan.blocks.reduce((sum, b) => sum + b.minutes, 0) ?? 0,
  );

  /** Ce que la génération prend en compte : dernière séance, fatigue, meilleure réussite. */
  protected readonly context = computed(() => {
    const s = this.last();
    if (!s) return null;
    const days = Math.round((startOfDay(this.today) - startOfDay(new Date(s.date))) / 86400000);
    const best = s.climbs
      .filter((c) => c.sent)
      .reduce<{ grade: string; v: number } | null>(
        (acc, c) => (!acc || c.gradeValue > acc.v ? { grade: c.grade, v: c.gradeValue } : acc),
        null,
      );
    return {
      focus: FOCUS_LABEL[s.focus].toLowerCase(),
      when: days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : `il y a ${days} jours`,
      fatigue: s.fatigue,
      best: best?.grade ?? null,
    };
  });

  ngOnInit(): void {
    this.api.listSessions(1).subscribe({ next: (list) => this.last.set(list[0] ?? null) });
    this.api
      .liveSchedule(7)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          const next = s.sessions[0] ?? null;
          this.advice.set(next);
          this.adviceSource.set(s.source);
          this.advicePending.set(!!s.advicePending);
          // Séance conseillée aujourd'hui : on part sur sa durée idéale, sauf choix déjà fait
          if (next && next.inDays === 0 && !this.result() && !this.touched) this.useAdvice(next);
        },
      });
    this.api.listGyms().subscribe({
      next: (list) => {
        this.gyms.set(list);
        // Salle supprimée depuis : on revient à « sans salle »
        if (this.gymId() && !list.some((g) => g.id === this.gymId())) this.pickGym(null);
      },
    });
  }

  protected useAdvice(a: PlannedSession): void {
    const value = Math.min(MAX, Math.max(MIN, a.durationMinutes));
    if (!this.presets.includes(value)) this.custom.set(value);
    this.minutes.set(value);
  }

  protected pick(value: number): void {
    this.touched = true;
    this.minutes.set(value);
  }

  protected pickGym(id: string | null): void {
    this.gymId.set(id || null);
    try {
      if (id) localStorage.setItem(GYM_KEY, id);
      else localStorage.removeItem(GYM_KEY);
    } catch {
      // stockage indisponible : le choix vaut pour cette visite
    }
  }

  protected step(delta: number): void {
    this.touched = true;
    const value = Math.min(MAX, Math.max(MIN, this.custom() + delta));
    this.custom.set(value);
    this.minutes.set(value);
  }

  protected generate(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.generatePlan(this.minutes(), this.gymId()).subscribe({
      next: (res) => {
        this.store.set(res);
        this.loading.set(false);
        window.scrollTo?.({ top: 0 });
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected back(): void {
    this.minutes.set(this.result()?.availableMinutes ?? this.minutes());
    this.store.set(null);
  }

  protected startSession(): void {
    this.store.start();
    this.router.navigate(['/seance-en-cours']);
  }

  /** Sur-titre d'un bloc : « 2 · Cœur — Force · Bloc 6B ». */
  protected overline(index: number): string {
    const r = this.result();
    const b = r?.plan.blocks[index];
    if (!r || !b) return '';
    let text = `${index + 1} · ${this.blockLabel[b.kind]}`;
    if (b.kind === 'main') text += ` — ${this.focusLabel[r.plan.focus]}`;
    return text;
  }
}

function readGym(): string | null {
  try {
    return localStorage.getItem(GYM_KEY);
  } catch {
    return null;
  }
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
