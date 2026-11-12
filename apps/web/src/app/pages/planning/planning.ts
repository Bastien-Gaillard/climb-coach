import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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

  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly duration = durationLabel;
  protected readonly relative = relativeDay;
  protected readonly dayDate = dayDate;

  protected readonly schedule = signal<Schedule | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly days = computed<Day[]>(() => {
    const s = this.schedule();
    if (!s) return [];
    const start = dayDate(s.today);
    return Array.from({ length: HORIZON }, (_, i) => {
      const date = new Date(start);
      date.setDate(start.getDate() + i);
      return { date, inDays: i, session: s.sessions.find((p) => p.inDays === i) ?? null };
    });
  });

  ngOnInit(): void {
    this.api.schedule(HORIZON).subscribe({
      next: (s) => this.schedule.set(s),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }
}
