import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { dayDate, durationLabel, errorMessage, FOCUS_LABEL, relativeDay } from '../../core/labels';
import { Focus, PlannedSession, Schedule, Session } from '../../core/models';
import { Icon } from '../../shared/icon';

/** Semaines affichées : la semaine en cours et les 4 suivantes. */
const WEEKS = 5;

export interface CalendarDay {
  key: string;
  date: Date;
  /** Jours à partir d'aujourd'hui (négatif = passé). */
  inDays: number;
  /** Séance faite ce jour-là. */
  done: Session | null;
  /** Séance prévue ce jour-là. */
  planned: PlannedSession | null;
}

/** AAAA-MM-JJ d'une date, en heure locale. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Planning sur un mois : calendrier semaine par semaine, puis le détail des séances à venir. */
@Component({
  selector: 'app-planning',
  imports: [DatePipe, RouterLink, Icon],
  templateUrl: './planning.html',
  styleUrl: './planning.scss',
})
export class PlanningPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private loading?: Subscription;

  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly focusLetter: Record<Focus, string> = {
    strength: 'F',
    endurance: 'E',
    technique: 'T',
  };
  protected readonly weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  protected readonly duration = durationLabel;
  protected readonly relative = relativeDay;
  protected readonly dayDate = dayDate;

  protected readonly rhythms = [1, 2, 3, 4, 5, 6, 7];
  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly history = signal<Session[]>([]);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Lundi de la semaine en cours. */
  private readonly start = computed(() => {
    const s = this.schedule();
    if (!s) return null;
    const today = dayDate(s.today);
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    return monday;
  });

  /** Jours à demander à l'API pour remplir le calendrier jusqu'au dernier dimanche. */
  private horizon(): number {
    const now = new Date();
    return WEEKS * 7 - ((now.getDay() + 6) % 7);
  }

  protected readonly calendar = computed<CalendarDay[][]>(() => {
    const s = this.schedule();
    const start = this.start();
    if (!s || !start) return [];
    const today = dayDate(s.today);
    const planned = new Map(s.sessions.map((p) => [p.date, p]));
    const done = new Map<string, Session>();
    for (const h of this.history()) done.set(dayKey(new Date(h.date)), h);

    return Array.from({ length: WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const key = dayKey(date);
        return {
          key,
          date,
          inDays: Math.round((date.getTime() - today.getTime()) / 86_400_000),
          done: done.get(key) ?? null,
          planned: planned.get(key) ?? null,
        };
      }),
    );
  });

  /** Séances prévues pendant la période affichée (au moins la prochaine). */
  protected readonly upcoming = computed(() => {
    const s = this.schedule();
    if (!s) return [];
    const max = this.horizon();
    const list = s.sessions.filter((p) => p.inDays < max);
    return list.length ? list : s.sessions.slice(0, 1);
  });

  /** Nombre de séances (faites + prévues) par semaine affichée, pour vérifier le rythme. */
  protected readonly weekCounts = computed(() =>
    this.calendar().map((week) => week.filter((d) => d.done || d.planned).length),
  );

  ngOnInit(): void {
    this.load();
    this.api
      .listSessions(40)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (list) => this.history.set(list) });
  }

  /** Nouveau rythme : enregistré sur le compte, puis planning recalculé. */
  protected setRhythm(n: number): void {
    const s = this.schedule();
    if (!s || s.sessionsPerWeek === n || this.saving()) return;
    this.schedule.set({ ...s, sessionsPerWeek: n });
    this.saving.set(true);
    this.api.updateSettings({ sessionsPerWeek: n }).subscribe({
      next: () => this.load(),
      error: (err) => {
        this.schedule.set(s);
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  /** Clic sur un jour prévu du calendrier : on descend jusqu'à son détail. */
  protected show(day: CalendarDay): void {
    if (!day.planned) return;
    document
      .getElementById(`plan-${day.key}`)
      ?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }

  private load(): void {
    this.loading?.unsubscribe();
    this.loading = this.api
      .liveSchedule(this.horizon())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.schedule.set(s);
          this.saving.set(false);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(errorMessage(err));
        },
      });
  }
}
