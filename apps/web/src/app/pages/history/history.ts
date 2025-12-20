import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { ProgressionPoint, Session } from '../../core/models';
import { ProgressionChart } from './progression-chart';

@Component({
  selector: 'app-history',
  imports: [DatePipe, RouterLink, ProgressionChart],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryPage implements OnInit {
  private readonly api = inject(ApiService);

  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly sessions = signal<Session[]>([]);
  protected readonly progression = signal<ProgressionPoint[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.api.progression().subscribe({ next: (p) => this.progression.set(p) });
    this.api.listSessions().subscribe({
      next: (list) => {
        this.sessions.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  protected remove(session: Session): void {
    if (!confirm('Supprimer cette séance ?')) return;
    this.api.deleteSession(session.id).subscribe({
      next: () => {
        this.sessions.update((list) => list.filter((s) => s.id !== session.id));
        this.progression.update((list) => list.filter((p) => p.sessionId !== session.id));
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected sentCount(session: Session): number {
    return session.climbs.filter((c) => c.sent).length;
  }
}
