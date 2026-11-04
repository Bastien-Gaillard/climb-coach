import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { GymColor } from '../core/models';

/** « 5 » si la plage tient sur une cotation, sinon « 5+ – 6A ». */
export function formatRange(c: Pick<GymColor, 'min' | 'max'>): string {
  return c.min === c.max ? c.min : `${c.min} – ${c.max}`;
}

/** Couleur de texte lisible sur la pastille (noir sur clair, blanc sur foncé). */
export function textOn(hex: string | undefined): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return 'var(--ink)';
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1f2328' : '#ffffff';
}

/**
 * Choix d'une couleur de salle par pastilles, utilisable avec formControlName
 * ou en direct avec [value] / (valueChange).
 */
@Component({
  selector: 'app-color-picker',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ColorPicker), multi: true },
  ],
  template: `
    <div class="picker" role="radiogroup" [attr.aria-label]="label()">
      @for (c of colors(); track c.color) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="c.color === selected()"
          [class.selected]="c.color === selected()"
          [style.background]="c.hex || '#e4e0d6'"
          [style.color]="text(c.hex)"
          [disabled]="disabled()"
          [title]="c.color + ' : ' + range(c)"
          (click)="pick(c.color)"
        >
          <span class="name">{{ c.color }}</span>
          <span class="range">{{ range(c) }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .picker {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    button {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.05rem;
      min-width: 4.5rem;
      padding: 0.35rem 0.6rem;
      border: 2px solid rgb(0 0 0 / 0.08);
      border-radius: 10px;
      line-height: 1.15;
      transition:
        transform 0.1s,
        box-shadow 0.1s;
    }
    button:hover:not(:disabled) {
      transform: translateY(-1px);
    }
    button.selected {
      border-color: var(--ink);
      box-shadow:
        0 0 0 2px var(--surface),
        0 0 0 4px var(--accent);
    }
    .name {
      font-weight: 600;
      font-size: 0.85rem;
    }
    .range {
      font-size: 0.72rem;
      opacity: 0.85;
    }
  `,
})
export class ColorPicker implements ControlValueAccessor {
  readonly colors = input.required<GymColor[]>();
  readonly label = input('Couleur');

  protected readonly selected = signal('');
  protected readonly disabled = signal(false);
  protected readonly range = formatRange;
  protected readonly text = textOn;

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  protected pick(color: string): void {
    this.selected.set(color);
    this.onChange(color);
    this.onTouched();
  }

  writeValue(value: string | null): void {
    this.selected.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
