import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { dayDate, durationLabel, errorMessage, FOCUS_LABEL, relativeDay } from '../../core/labels';
import { PlannedSession, Schedule } from '../../core/models';
import { Icon } from '../../shared/icon';

const HORIZON = 7;

interface Day {
  date: Date;
  inDays: number;
  session: PlannedSession | null;
}

/** Semaine à venir : un jour = une séance conseillée ou du repos. */
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
  protected readonly duration = durationLabel;
  protected readonly relative = relativeDay;
  protected readonly dayDate = dayDate;

  protected readonly rhythms = [1, 2, 3, 4, 5, 6, 7];
  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly days = computed<Day[]>(() => {
    const s = this.schedule();
    if (!s) return [];
    const start = dayDate(s.today);
    // Repos long (blessure…) : on prolonge jusqu'à la prochaine séance pour qu'elle reste visible
    const length = Math.max(HORIZON, (s.sessions[0]?.inDays ?? 0) + 1);
    return Array.from({ length }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { date, inDays: i, session: s.sessions.find((p) => p.inDays === i) ?? null };
    });
  });

  ngOnInit(): void {
    this.load();
  }

  /** Seule la prochaine séance est décidée par Mistral, la suite vient des règles. */
  protected isAdvised(s: PlannedSession): boolean {
    const schedule = this.schedule();
    return schedule?.source === 'mistral' && schedule.sessions[0] === s;
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

  private load(): void {
    this.loading?.unsubscribe();
    this.loading = this.api
      .liveSchedule(HORIZON)
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
