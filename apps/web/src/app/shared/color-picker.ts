import { Component, forwardRef, input, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { GymColor } from '../core/models';
import { holdVars, onHold } from './hold';

/** « 5 » si la plage tient sur une cotation, sinon « 5+ – 6A ». */
export function formatRange(c: Pick<GymColor, 'min' | 'max'>): string {
  return c.min === c.max ? c.min : `${c.min} – ${c.max}`;
}

/** Couleur de texte lisible sur la pastille (encre sur clair, blanc sur foncé). */
export const textOn = onHold;

/**
 * Choix d'une couleur de salle par pastilles rondes, utilisable avec formControlName
 * ou en direct avec [ngModel].
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
          [disabled]="disabled()"
          [title]="c.color + ' : ' + range(c)"
          (click)="pick(c.color)"
        >
          <span
            class="hold"
            [style]="vars(c.hex)"
            [style.width.px]="size()"
            [style.height.px]="size()"
          ></span>
          <span class="name">{{ c.color }}</span>
          <span class="range">{{ range(c) }}</span>
        </button>
      }
    </div>
  `,
  styles: `
    .picker {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
      gap: 10px 6px;
    }
    button {
      flex-direction: column;
      gap: 6px;
      padding: 4px 0;
      min-height: 0;
      background: transparent;
      line-height: 1.15;
    }
    button.selected .hold {
      box-shadow:
        0 0 0 3px var(--surface),
        0 0 0 6px var(--ink);
    }
    .name {
      font-weight: 600;
      font-size: 14px;
      text-transform: capitalize;
    }
    .range {
      font-size: 13px;
      font-weight: 500;
      color: var(--muted);
    }
  `,
})
export class ColorPicker implements ControlValueAccessor {
  readonly colors = input.required<GymColor[]>();
  readonly label = input('Couleur');
  /** Diamètre des pastilles (68 px en saisie, plus petit ailleurs). */
  readonly size = input(56);

  protected readonly selected = signal('');
  protected readonly disabled = signal(false);
  protected readonly range = formatRange;
  protected readonly vars = holdVars;

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

  registerOnTouched(fn: (value: string) => void): void {
    this.onTouched = fn as () => void;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
