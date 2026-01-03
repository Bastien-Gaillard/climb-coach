import { Component, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { GradeSystem, GYMS, SCALES } from '@climb-coach/grades';
import { ApiService } from '../../core/api.service';
import { errorMessage, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { ClimbInput, CreateSession, Focus, Style } from '../../core/models';

const DEFAULT_SYSTEM: Record<Style, GradeSystem> = { boulder: 'font', route: 'french' };

/** Date locale au format attendu par <input type="datetime-local">. */
function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

@Component({
  selector: 'app-new-session',
  imports: [ReactiveFormsModule],
  templateUrl: './new-session.html',
  styleUrl: './new-session.scss',
})
export class NewSessionPage {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  protected readonly focusOptions = Object.entries(FOCUS_LABEL) as [Focus, string][];
  protected readonly styleOptions = Object.entries(STYLE_LABEL) as [Style, string][];
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    date: [localNow(), Validators.required],
    durationMinutes: [90, [Validators.required, Validators.min(10), Validators.max(600)]],
    focus: this.fb.control<Focus>('strength'),
    fatigue: [3, [Validators.min(1), Validators.max(5)]],
    notes: [''],
    climbs: this.fb.array<FormGroup>([]),
  });

  get climbs(): FormArray<FormGroup> {
    return this.form.controls.climbs;
  }

  constructor() {
    this.addClimb();
  }

  protected addClimb(): void {
    // On reprend le style, le mode et la salle de la voie précédente : on enchaîne souvent les mêmes
    const previous = this.climbs.at(this.climbs.length - 1)?.getRawValue();
    const style: Style = previous?.style ?? 'boulder';
    const system: GradeSystem = previous?.system ?? DEFAULT_SYSTEM[style];
    const gymId: string = previous?.gymId ?? this.gymsFor(style)[0]?.id ?? '';

    this.climbs.push(
      this.fb.group({
        style: [style],
        mode: [previous?.mode ?? 'grade'],
        system: [system],
        grade: [previous?.grade ?? SCALES[system].grades[6][0]],
        gymId: [gymId],
        color: [previous?.color ?? this.colorsFor(gymId)[0]?.color ?? ''],
        sent: [true],
        attempts: [1, [Validators.min(1), Validators.max(50)]],
      }),
    );
  }

  protected removeClimb(index: number): void {
    this.climbs.removeAt(index);
  }

  /** Quand on change de style, on remet un système et une salle compatibles. */
  protected onStyleChange(group: FormGroup): void {
    const style = group.value.style as Style;
    const system = DEFAULT_SYSTEM[style];
    const gymId = this.gymsFor(style)[0]?.id ?? '';
    group.patchValue({
      system,
      grade: SCALES[system].grades[6][0],
      gymId,
      color: this.colorsFor(gymId)[0]?.color ?? '',
    });
    if (!gymId) group.patchValue({ mode: 'grade' });
  }

  protected onSystemChange(group: FormGroup): void {
    const system = group.value.system as GradeSystem;
    group.patchValue({
      grade: SCALES[system].grades[Math.min(6, SCALES[system].grades.length - 1)][0],
    });
  }

  protected onGymChange(group: FormGroup): void {
    group.patchValue({ color: this.colorsFor(group.value.gymId)[0]?.color ?? '' });
  }

  protected systemsFor(style: Style) {
    return Object.values(SCALES).filter((s) => s.discipline === style);
  }

  protected gradesFor(system: GradeSystem): string[] {
    return SCALES[system].grades.map(([g]) => g);
  }

  protected gymsFor(style: Style) {
    return GYMS.filter((g) => g.discipline === style);
  }

  protected colorsFor(gymId: string) {
    return GYMS.find((g) => g.id === gymId)?.colors ?? [];
  }

  protected setFatigue(value: number): void {
    this.form.controls.fatigue.setValue(value);
  }

  protected submit(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();

    const body: CreateSession = {
      date: new Date(v.date).toISOString(),
      durationMinutes: v.durationMinutes,
      focus: v.focus,
      fatigue: v.fatigue,
      notes: v.notes.trim() || undefined,
      climbs: v.climbs.map((c): ClimbInput => {
        const common = { style: c['style'], sent: c['sent'], attempts: c['attempts'] };
        return c['mode'] === 'color'
          ? { ...common, color: c['color'], gymId: c['gymId'] }
          : { ...common, grade: c['grade'], system: c['system'] };
      }),
    };

    this.saving.set(true);
    this.error.set(null);
    this.api.createSession(body).subscribe({
      next: () => this.router.navigate(['/historique']),
      error: (err) => {
        this.error.set(errorMessage(err));
        this.saving.set(false);
      },
    });
  }
}
