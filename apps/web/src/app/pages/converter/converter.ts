import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  colorRange,
  convertColor,
  convertGrade,
  Gym,
  GradeSystem,
  SCALES,
} from '@climb-coach/grades';
import { GymsStore } from '../../core/gyms.store';
import { ColorPicker } from '../../shared/color-picker';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';

interface ConversionResult {
  ok: boolean;
  text: string;
}

/**
 * Conversion côté navigateur : la lib est partagée avec l'API.
 * Seule la liste des salles vient du serveur.
 */
@Component({
  selector: 'app-converter',
  imports: [RouterLink, FormsModule, ColorPicker, Icon],
  templateUrl: './converter.html',
  styleUrl: './converter.scss',
})
export class ConverterPage implements OnInit {
  private readonly store = inject(GymsStore);
  protected readonly scales = Object.values(SCALES);
  protected readonly gyms = this.store.gyms;
  protected readonly gymsLoaded = this.store.loaded;
  protected readonly holdVars = holdVars;

  ngOnInit(): void {
    this.store.load();
  }

  // --- Cotations
  protected readonly from = signal<GradeSystem>('font');
  protected readonly to = signal<GradeSystem>('vscale');
  protected readonly grade = signal('6B');

  protected readonly fromGrades = computed(() => SCALES[this.from()].grades.map(([g]) => g));
  protected readonly targets = computed(() =>
    this.scales.filter(
      (s) => s.discipline === SCALES[this.from()].discipline && s.system !== this.from(),
    ),
  );
  protected readonly gradeResult = computed<ConversionResult>(() => {
    try {
      return { ok: true, text: convertGrade(this.grade(), this.from(), this.to()) };
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  });

  // --- Couleurs (les choix vides retombent sur la première salle / couleur compatible)
  protected readonly fromGymId = signal('');
  protected readonly toGymId = signal('');
  protected readonly selectedColor = signal('');

  protected readonly fromGym = computed<Gym | null>(
    () => this.gyms().find((g) => g.id === this.fromGymId()) ?? this.gyms()[0] ?? null,
  );
  protected readonly compatibleGyms = computed(() => {
    const from = this.fromGym();
    return from
      ? this.gyms().filter((g) => g.discipline === from.discipline && g.id !== from.id)
      : [];
  });
  protected readonly toGym = computed<Gym | null>(
    () =>
      this.compatibleGyms().find((g) => g.id === this.toGymId()) ??
      this.compatibleGyms()[0] ??
      null,
  );
  protected readonly color = computed(() => {
    const colors = this.fromGym()?.colors ?? [];
    return colors.find((c) => c.color === this.selectedColor())?.color ?? colors[0]?.color ?? '';
  });

  protected readonly sourceRange = computed(() => {
    const from = this.fromGym();
    try {
      return from ? colorRange(from, this.color()) : null;
    } catch {
      return null;
    }
  });
  protected readonly matches = computed(() => {
    const from = this.fromGym();
    const to = this.toGym();
    if (!from || !to) return [];
    try {
      return convertColor(this.color(), from, to).map((m) => ({
        ...m,
        ...colorRange(to, m.color),
        hex: this.hex(to, m.color),
      }));
    } catch {
      return [];
    }
  });

  protected setFrom(system: string) {
    this.from.set(system as GradeSystem);
    this.to.set(this.targets()[0].system);
    this.grade.set(this.fromGrades()[Math.floor(this.fromGrades().length / 3)]);
  }

  /** Inverse les deux systèmes en gardant la cotation convertie. */
  protected swap() {
    const result = this.gradeResult();
    const from = this.from();
    this.from.set(this.to());
    this.to.set(from);
    if (result.ok && this.fromGrades().includes(result.text)) this.grade.set(result.text);
    else this.grade.set(this.fromGrades()[Math.floor(this.fromGrades().length / 3)]);
  }

  protected setFromGym(id: string) {
    this.fromGymId.set(id);
    this.selectedColor.set('');
    this.toGymId.set('');
  }

  protected hex(gym: Gym, color: string): string | undefined {
    return gym.colors.find((c) => c.color === color)?.hex;
  }

  protected percent(overlap: number): string {
    return `${Math.round(overlap * 100)} %`;
  }
}
