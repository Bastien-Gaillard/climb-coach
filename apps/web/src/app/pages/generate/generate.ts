import { Component, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { BLOCK_ICON, errorMessage, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { GeneratedPlan } from '../../core/models';

@Component({
  selector: 'app-generate',
  templateUrl: './generate.html',
  styleUrl: './generate.scss',
})
export class GeneratePage {
  private readonly api = inject(ApiService);

  protected readonly presets = [45, 60, 90, 120];
  protected readonly focusLabel = FOCUS_LABEL;
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly icon = BLOCK_ICON;

  protected readonly minutes = signal(90);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly result = signal<GeneratedPlan | null>(null);

  protected readonly total = computed(
    () => this.result()?.plan.blocks.reduce((sum, b) => sum + b.minutes, 0) ?? 0,
  );

  protected setMinutes(value: number): void {
    if (Number.isFinite(value)) this.minutes.set(Math.min(300, Math.max(30, Math.round(value))));
  }

  protected generate(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.generatePlan(this.minutes()).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(errorMessage(err));
        this.loading.set(false);
      },
    });
  }

  /** Largeur du bloc dans la frise, en % de la séance. */
  protected share(minutes: number): string {
    return `${(minutes / Math.max(1, this.total())) * 100}%`;
  }
}
