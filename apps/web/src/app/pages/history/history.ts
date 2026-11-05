import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { GymsStore } from '../../core/gyms.store';
import { errorMessage, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { Climb, ProgressionPoint, Session, Style } from '../../core/models';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';
import { ClimbChip, groupClimbs } from './climb-chips';
import { ProgressionChart } from './progression-chart';

/** Meilleure voie réussie d'une liste (valeur sur l'échelle de référence). */
function best(climbs: Climb[], style?: Style): Climb | null {
  return climbs
    .filter((c) => c.sent && (!style || c.style === style))
    .reduce<Climb | null>((acc, c) => (!acc || c.gradeValue > acc.gradeValue ? c : acc), null);
}

@Component({
  selector: 'app-history',
  imports: [DatePipe, DecimalPipe, RouterLink, ProgressionChart, Icon],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class HistoryPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly gyms = inject(GymsStore);
  protected readonly holdVars = holdVars;

  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly sessions = signal<Session[]>([]);
  protected readonly progression = signal<ProgressionPoint[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Chiffres clés sur les séances chargées. */
  protected readonly summary = computed(() => {
    const list = this.sessions();
    if (!list.length) return null;
    const climbs = list.flatMap((s) => s.climbs);
    const boulders = climbs.filter((c) => c.style === 'boulder').length;
    const style: Style = boulders >= climbs.length - boulders ? 'boulder' : 'route';
    const times = list.map((s) => new Date(s.date).getTime());
    const weeks = Math.max(1, (Math.max(...times) - Math.min(...times)) / (7 * 86400000));
    return {
      bestLabel: style === 'boulder' ? 'Meilleur bloc' : 'Meilleure voie',
      best: best(climbs, style)?.grade ?? '—',
      count: list.length,
      perWeek: list.length / weeks,
      sent: climbs.filter((c) => c.sent).length,
      total: climbs.length,
      fatigue: list.reduce((a, s) => a + s.fatigue, 0) / list.length,
    };
  });

  ngOnInit(): void {
    this.gyms.load();
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

  /** Relit le store des salles pour que les couleurs apparaissent dès qu'il est chargé. */
  protected chips(session: Session): ClimbChip[] {
    this.gyms.gyms();
    return groupClimbs(session.climbs, (id) => this.gyms.find(id));
  }

  protected gymNames(session: Session): string {
    this.gyms.gyms();
    const ids = [...new Set(session.climbs.map((c) => c.gymId).filter((id) => !!id))];
    return ids
      .map((id) => this.gyms.find(id!)?.name)
      .filter(Boolean)
      .join(', ');
  }

  protected bestGrade(session: Session): string | null {
    return best(session.climbs)?.grade ?? null;
  }

  protected chipTitle(c: ClimbChip): string {
    const what = c.color ? `${c.color} (${c.grade})` : c.grade;
    const result = c.sent
      ? 'réussi'
      : `pas encore, ${c.attempts} essai${c.attempts > 1 ? 's' : ''}`;
    return `${this.styleLabel[c.style]} ${what} : ${result}${c.count > 1 ? ` · ×${c.count}` : ''}`;
  }

  protected sentCount(session: Session): number {
    return session.climbs.filter((c) => c.sent).length;
  }
}
