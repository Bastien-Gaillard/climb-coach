import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { GradeSystem, gradeValue, SCALES } from '@climb-coach/grades';
import { GymsStore } from '../../core/gyms.store';
import { errorMessage, STYLE_LABEL } from '../../core/labels';
import { Gym, GymInput, Style } from '../../core/models';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';

const DEFAULT_SYSTEM: Record<Style, GradeSystem> = { boulder: 'font', route: 'french' };
// Teintes de prises de la refonte (les seules couleurs vives de l'interface)
const PALETTE = [
  '#f2c230',
  '#2e9e5b',
  '#2f6fd6',
  '#c62f2f',
  '#1a1a1a',
  '#7b4bc4',
  '#f07a1e',
  '#e05c9a',
  '#f7f7f4',
  '#1fa3a0',
];

/** Code couleur proposé d'après le nom tapé (tant qu'on n'a pas choisi la couleur soi-même). */
const HEX_BY_NAME: Record<string, string> = {
  jaune: '#f2c230',
  vert: '#2e9e5b',
  bleu: '#2f6fd6',
  rouge: '#c62f2f',
  noir: '#1a1a1a',
  violet: '#7b4bc4',
  orange: '#f07a1e',
  rose: '#e05c9a',
  blanc: '#f7f7f4',
  gris: '#8e8e8a',
  marron: '#8a5a2b',
  turquoise: '#1fa3a0',
};

export function hexForName(name: string): string | undefined {
  const key = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return HEX_BY_NAME[key] ?? HEX_BY_NAME[key.split(/\s+/)[0]];
}

type ColorGroup = FormGroup<{
  color: FormControl<string>;
  hex: FormControl<string>;
  min: FormControl<string>;
  max: FormControl<string>;
}>;

/** Création ou modification d'une salle : nom, discipline, système et grille de couleurs. */
@Component({
  selector: 'app-gym-editor',
  imports: [ReactiveFormsModule, Icon],
  templateUrl: './gym-editor.html',
  styleUrl: './gym-editor.scss',
})
export class GymEditor {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly store = inject(GymsStore);

  /** Salle à modifier, ou null pour en créer une. */
  readonly gym = input<Gym | null>(null);
  readonly saved = output<Gym>();
  readonly cancelled = output<void>();
  /** Demande de suppression (la page gère la confirmation). */
  readonly removeRequested = output<void>();

  protected readonly styleOptions = Object.entries(STYLE_LABEL) as [Style, string][];
  protected readonly holdVars = holdVars;
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    discipline: this.fb.control<Style>('boulder'),
    system: this.fb.control<GradeSystem>('font'),
    colors: this.fb.array<ColorGroup>([]),
  });

  protected readonly value = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  get colors(): FormArray<ColorGroup> {
    return this.form.controls.colors;
  }

  protected readonly system = computed(() => (this.value().system ?? 'font') as GradeSystem);
  protected readonly grades = computed(() => SCALES[this.system()].grades.map(([g]) => g));
  protected readonly systems = computed(() =>
    Object.values(SCALES).filter((s) => s.discipline === (this.value().discipline ?? 'boulder')),
  );

  /** Aperçu : chaque couleur positionnée sur l'échelle, pour repérer trous et chevauchements. */
  protected readonly preview = computed(() => {
    const grades = this.grades();
    const max = grades.length;
    return (this.value().colors ?? []).flatMap((c) => {
      const from = grades.indexOf(c?.min ?? '');
      const to = grades.indexOf(c?.max ?? '');
      if (from < 0 || to < 0 || from > to) return [];
      return [
        {
          label: c?.color || '?',
          hex: c?.hex || '#cccccc',
          left: (from / max) * 100,
          width: ((to - from + 1) / max) * 100,
        },
      ];
    });
  });

  /** Graduations de l'aperçu : une cotation sur deux (ou trois) pour rester lisible. */
  protected readonly ticks = computed(() => {
    const grades = this.grades();
    const step = grades.length > 20 ? 3 : 2;
    return grades
      .map((g, i) => ({ g, left: ((i + 0.5) / grades.length) * 100 }))
      .filter((_, i) => i % step === 0);
  });

  constructor() {
    // Remplit le formulaire quand on change de salle à modifier
    effect(() => {
      const gym = this.gym();
      this.colors.clear();
      if (gym) {
        this.form.patchValue({ name: gym.name, discipline: gym.discipline, system: gym.system });
        gym.colors.forEach((c) =>
          this.colors.push(this.colorGroup(c.color, c.hex ?? '', c.min, c.max)),
        );
      } else {
        this.form.reset({ name: '', discipline: 'boulder', system: 'font' });
        this.addColor();
      }
      this.error.set(null);
    });
  }

  protected addColor(): void {
    const grades = SCALES[this.form.controls.system.value].grades.map(([g]) => g);
    const last = this.colors.at(this.colors.length - 1)?.getRawValue();
    const start = last ? Math.min(grades.length - 1, grades.indexOf(last.max) + 1) : 1;
    const end = Math.min(grades.length - 1, start + 2);
    const hex = PALETTE[this.colors.length % PALETTE.length];
    this.colors.push(this.colorGroup('', hex, grades[start], grades[end]));
  }

  protected removeColor(index: number): void {
    this.colors.removeAt(index);
  }

  protected moveColor(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.colors.length) return;
    const ctrl = this.colors.at(index);
    this.colors.removeAt(index);
    this.colors.insert(target, ctrl);
  }

  protected setDiscipline(style: Style): void {
    if (this.form.controls.discipline.value === style) return;
    this.form.controls.discipline.setValue(style);
    this.onDisciplineChange();
  }

  /** Nouvelle discipline : système par défaut et plages remises dans la nouvelle échelle. */
  protected onDisciplineChange(): void {
    this.form.controls.system.setValue(DEFAULT_SYSTEM[this.form.controls.discipline.value]);
    this.onSystemChange();
  }

  protected onSystemChange(): void {
    const grades = SCALES[this.form.controls.system.value].grades.map(([g]) => g);
    this.colors.controls.forEach((c, i) => {
      const start = Math.min(grades.length - 1, 1 + i * 2);
      c.patchValue({ min: grades[start], max: grades[Math.min(grades.length - 1, start + 1)] });
    });
  }

  protected rangeError(group: ColorGroup): string | null {
    const { min, max } = group.getRawValue();
    try {
      return gradeValue(min, this.system()) > gradeValue(max, this.system())
        ? 'Le min dépasse le max'
        : null;
    } catch {
      return null;
    }
  }

  protected readonly hasRangeError = computed(() => {
    this.value();
    return this.colors.controls.some((c) => this.rangeError(c) !== null);
  });

  protected submit(): void {
    if (this.form.invalid || this.hasRangeError() || this.saving()) return;
    const v = this.form.getRawValue();
    const body: GymInput = {
      name: v.name.trim(),
      discipline: v.discipline,
      system: v.system,
      colors: v.colors.map((c) => ({
        color: c.color.trim(),
        hex: c.hex || undefined,
        min: c.min,
        max: c.max,
      })),
    };

    const current = this.gym();
    const request = current ? this.store.update(current.id, body) : this.store.create(body);
    this.saving.set(true);
    this.error.set(null);
    request.subscribe({
      next: (gym) => {
        this.saving.set(false);
        this.saved.emit(gym);
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }

  private colorGroup(color: string, hex: string, min: string, max: string): ColorGroup {
    const group = this.fb.group({
      color: this.fb.control(color, [Validators.required, Validators.maxLength(30)]),
      hex: this.fb.control(hex),
      min: this.fb.control(min),
      max: this.fb.control(max),
    });
    group.controls.color.valueChanges.subscribe((name) => {
      const suggested = hexForName(name);
      if (suggested && !group.controls.hex.dirty) group.controls.hex.setValue(suggested);
    });
    return group;
  }
}
