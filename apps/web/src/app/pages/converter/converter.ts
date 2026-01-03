import { Component, computed, signal } from '@angular/core';
import {
  colorRange,
  convertColor,
  convertGrade,
  findGym,
  Gym,
  GradeSystem,
  GYMS,
  SCALES,
} from '@climb-coach/grades';

interface ConversionResult {
  ok: boolean;
  text: string;
}

/** Conversion côté navigateur : la lib est partagée avec l'API, pas besoin d'appel réseau. */
@Component({
  selector: 'app-converter',
  templateUrl: './converter.html',
  styleUrl: './converter.scss',
})
export class ConverterPage {
  protected readonly scales = Object.values(SCALES);
  protected readonly gyms = GYMS;

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

  // --- Couleurs
  protected readonly fromGymId = signal(GYMS[0].id);
  protected readonly toGymId = signal(GYMS[1].id);
  protected readonly color = signal(GYMS[0].colors[3].color);

  protected readonly fromGym = computed(() => findGym(this.fromGymId()));
  protected readonly toGym = computed(() => findGym(this.toGymId()));
  protected readonly compatibleGyms = computed(() =>
    this.gyms.filter(
      (g) => g.discipline === this.fromGym().discipline && g.id !== this.fromGymId(),
    ),
  );
  protected readonly sourceRange = computed(() => {
    try {
      return colorRange(this.fromGym(), this.color());
    } catch {
      return null;
    }
  });
  protected readonly matches = computed(() => {
    try {
      return convertColor(this.color(), this.fromGym(), this.toGym()).map((m) => ({
        ...m,
        ...colorRange(this.toGym(), m.color),
        hex: this.hex(this.toGym(), m.color),
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

  protected setFromGym(id: string) {
    this.fromGymId.set(id);
    this.color.set(this.fromGym().colors[0].color);
    const target = this.compatibleGyms()[0];
    if (target) this.toGymId.set(target.id);
  }

  protected hex(gym: Gym, color: string): string {
    return gym.colors.find((c) => c.color === color)?.hex ?? '#ccc';
  }

  protected percent(overlap: number): string {
    return `${Math.round(overlap * 100)} %`;
  }
}
