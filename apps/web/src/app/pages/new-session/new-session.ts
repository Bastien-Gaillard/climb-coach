import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, HostListener, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { GradeSystem, SCALES } from '@climb-coach/grades';
import { ApiService } from '../../core/api.service';
import { GymsStore } from '../../core/gyms.store';
import { errorMessage, FATIGUE_LABEL, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { Climb, ClimbInput, CreateSession, Focus, Gym, GymColor, Style } from '../../core/models';
import { PlanStore } from '../../core/plan.store';
import { formatRange } from '../../shared/color-picker';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';
import { ClimbChip, groupClimbs } from '../history/climb-chips';

const LAST_GYM = 'climb-coach.lastGym';

/** Une voie de la séance, telle que saisie. */
export interface Entry {
  style: Style;
  /** Saisie par couleur de salle… */
  gymId?: string;
  color?: string;
  hex?: string;
  /** … ou par cotation. */
  system?: GradeSystem;
  grade?: string;
  /** Libellé court affiché dans la pastille (cotation). */
  short: string;
  /** Libellé complet : nom de couleur ou « Cotation 6B ». */
  name: string;
  range: string;
  sent: boolean;
  attempts: number;
}

/** Date locale au format attendu par <input type="datetime-local">. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function readLastGym(): string | null {
  try {
    return localStorage.getItem(LAST_GYM);
  } catch {
    return null;
  }
}

/**
 * Saisie rapide : une touche sur une couleur = voie réussie du premier coup,
 * puis on corrige la dernière (ratée, +1 essai, encore…). Les infos de séance
 * se remplissent à la fin (« Terminer » sur mobile, colonne de gauche sur ordinateur).
 */
@Component({
  selector: 'app-new-session',
  imports: [FormsModule, RouterLink, NgTemplateOutlet, Icon],
  templateUrl: './new-session.html',
  styleUrl: './new-session.scss',
})
export class NewSessionPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly gyms = inject(GymsStore);
  private readonly plan = inject(PlanStore);

  protected readonly focusOptions = Object.entries(FOCUS_LABEL) as [Focus, string][];
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly fatigueLabel = FATIGUE_LABEL;
  protected readonly systems = Object.values(SCALES);
  protected readonly holdVars = holdVars;
  protected readonly allGyms = this.gyms.gyms;
  protected readonly gymsLoaded = this.gyms.loaded;

  // --- Saisie
  protected readonly gymId = signal<string>(readLastGym() ?? '');
  protected readonly mode = signal<'color' | 'grade'>('color');
  protected readonly system = signal<GradeSystem>('font');
  protected readonly log = signal<Entry[]>([]);
  protected readonly sel = signal(-1);
  /** Mobile : saisie des voies, puis écran « Terminer ». */
  protected readonly step = signal<'log' | 'finish'>('log');

  // --- Infos de séance
  protected date = localNow();
  protected duration = this.plan.elapsedMinutes() ?? 90;
  protected readonly focus = signal<Focus>(this.plan.focus() ?? 'strength');
  protected readonly fatigue = signal(3);
  protected notes = '';

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly gym = computed<Gym | null>(() => {
    const list = this.allGyms();
    return list.find((g) => g.id === this.gymId()) ?? list[0] ?? null;
  });
  protected readonly colorMode = computed(() => this.mode() === 'color' && !!this.gym());
  protected readonly grades = computed(() => SCALES[this.system()].grades.map(([g]) => g));
  protected readonly current = computed(() => this.log()[this.sel()] ?? null);

  protected readonly stats = computed(() => {
    const log = this.log();
    return {
      count: log.length,
      sent: log.filter((e) => e.sent).length,
      tries: log.reduce((a, e) => a + e.attempts, 0),
    };
  });

  /** Récapitulatif regroupé, avec la même logique que l'historique. */
  protected readonly groups = computed<ClimbChip[]>(() =>
    groupClimbs(
      this.log().map((e, i): Climb => ({
        id: String(i),
        style: e.style,
        grade: e.grade ?? e.range,
        gradeValue: 0,
        color: e.color ?? null,
        gymId: e.gymId ?? null,
        sent: e.sent,
        attempts: e.attempts,
      })),
      (id) => this.gyms.find(id),
    ),
  );

  constructor() {
    // Salle connue : on se cale sur son système de cotation pour la saisie par cotation
    effect(() => {
      const g = this.gym();
      if (g) this.system.set(g.system);
      else if (this.gymsLoaded()) this.mode.set('grade');
    });
  }

  ngOnInit(): void {
    this.gyms.load();
  }

  protected setGym(id: string): void {
    this.gymId.set(id);
    try {
      localStorage.setItem(LAST_GYM, id);
    } catch {
      /* stockage indisponible */
    }
  }

  protected addColor(c: GymColor): void {
    const g = this.gym();
    if (!g) return;
    this.push({
      style: g.discipline,
      gymId: g.id,
      color: c.color,
      hex: c.hex,
      short: c.min,
      name: c.color,
      range: formatRange(c),
      sent: true,
      attempts: 1,
    });
  }

  protected addGrade(grade: string): void {
    const scale = SCALES[this.system()];
    this.push({
      style: scale.discipline,
      system: scale.system,
      grade,
      short: grade,
      name: `Cotation ${grade}`,
      range: `${STYLE_LABEL[scale.discipline]} · ${scale.label}`,
      sent: true,
      attempts: 1,
    });
  }

  private push(e: Entry): void {
    this.log.update((l) => [...l, e]);
    this.sel.set(this.log().length - 1);
  }

  private patch(fn: (e: Entry) => Entry): void {
    const i = this.sel();
    if (!this.log()[i]) return;
    this.log.update((l) => l.map((e, k) => (k === i ? fn({ ...e }) : e)));
  }

  protected toggleSent(): void {
    this.patch((e) => ({ ...e, sent: !e.sent }));
  }

  protected plusOne(): void {
    this.patch((e) => ({ ...e, attempts: Math.min(50, e.attempts + 1) }));
  }

  protected again(): void {
    const cur = this.current();
    if (cur) this.push({ ...cur, sent: true, attempts: 1 });
  }

  protected removeCurrent(): void {
    const i = this.sel();
    this.log.update((l) => l.filter((_, k) => k !== i));
    this.sel.set(this.log().length - 1);
  }

  protected entryLabel(e: Entry, i: number): string {
    return `Voie ${i + 1}, ${e.name}, ${e.sent ? 'réussie' : 'ratée'}, ${e.attempts} essai${e.attempts > 1 ? 's' : ''}`;
  }

  /** Raccourcis clavier (ordinateur) : 1–9 couleur, R ratée/réussie, + essai, Entrée encore. */
  @HostListener('document:keydown', ['$event'])
  protected onKey(ev: KeyboardEvent): void {
    const t = ev.target as HTMLElement | null;
    if (t?.closest('input, textarea, select, [contenteditable]') || ev.metaKey || ev.ctrlKey)
      return;
    const g = this.gym();
    if (/^[1-9]$/.test(ev.key) && this.colorMode() && g) {
      const c = g.colors[Number(ev.key) - 1];
      if (c) this.addColor(c);
    } else if (ev.key === 'r' || ev.key === 'R') this.toggleSent();
    else if (ev.key === '+') this.plusOne();
    else if (ev.key === 'Enter' && t?.tagName !== 'BUTTON') this.again();
    else if (ev.key === 'Backspace' || ev.key === 'Delete') this.removeCurrent();
    else return;
    ev.preventDefault();
  }

  protected readonly valid = () =>
    !!this.date && Number.isFinite(this.duration) && this.duration >= 10 && this.duration <= 600;

  protected submit(): void {
    if (!this.valid() || this.saving()) return;
    const body: CreateSession = {
      date: new Date(this.date).toISOString(),
      durationMinutes: Math.round(this.duration),
      focus: this.focus(),
      fatigue: this.fatigue(),
      notes: this.notes.trim() || undefined,
      climbs: this.log().map((e): ClimbInput => {
        const common = { style: e.style, sent: e.sent, attempts: e.attempts };
        return e.gymId
          ? { ...common, color: e.color, gymId: e.gymId }
          : { ...common, grade: e.grade, system: e.system };
      }),
    };

    this.saving.set(true);
    this.error.set(null);
    this.api.createSession(body).subscribe({
      next: () => {
        this.plan.finish();
        this.router.navigate(['/historique']);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }
}
