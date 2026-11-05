import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { BLOCK_LABEL, errorMessage, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { Gym, Session } from '../../core/models';
import { PlanStore } from '../../core/plan.store';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';

const MIN = 30;
/** Dernière salle choisie, retenue d'une fois sur l'autre. */
const GYM_KEY = 'climb-coach.gym';
const MAX = 300;

@Component({
  selector: 'app-generate',
  imports: [DatePipe, Icon],
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
    this.api.listGyms().subscribe({
      next: (list) => {
        this.gyms.set(list);
        // Salle supprimée depuis : on revient à « sans salle »
        if (this.gymId() && !list.some((g) => g.id === this.gymId())) this.pickGym(null);
      },
    });
  }

  protected pick(value: number): void {
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
