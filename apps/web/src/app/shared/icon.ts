import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Tracés 24×24 de la refonte (trait arrondi, couleur = currentColor). */
const PATHS = {
  generate: 'M12 3v5M12 16v5M3 12h5M16 12h5',
  history: 'M4 4v16h16M8 15l4-5 3 3 5-6',
  plus: 'M12 5v14M5 12h14',
  gym: 'M4 20V7l8-4 8 4v13z',
  convert: 'M5 8h13l-3-3M19 16H6l3 3',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  rules: 'M5 6h14M5 12h14M5 18h9',
  redo: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  again: 'M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 3.5v5h-5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20.5v-5h5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  down: 'M12 5v14M6 13l6 6 6-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  up: 'M6 15l6-6 6 6',
  chevron: 'M6 9l6 6 6-6',
  calendar: 'M4 6.5h16v13.5H4zM4 10.5h16M8.5 3.5v5M15.5 3.5v5',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20a7.5 7.5 0 0 1 15 0',
} as const;

/** Icônes pleines (lecture, pause, saut). */
const FILLED = {
  play: 'M7 4.5v15l13-7.5z',
  pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
  prev: 'M6 5h2.5v14H6zM20 5v14L9.5 12z',
  next: 'M15.5 5H18v14h-2.5zM4 5v14l10.5-7z',
} as const;

export type IconName = keyof typeof PATHS | keyof typeof FILLED;

@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', style: 'display:inline-flex;flex:none' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      [attr.stroke]="filled() ? null : 'currentColor'"
      [attr.stroke-width]="stroke()"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path [attr.d]="d()" />
      @if (name() === 'gym') {
        <circle cx="9" cy="11" r="1.3" />
        <circle cx="15" cy="13" r="1.3" />
        <circle cx="10" cy="16.5" r="1.3" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(24);
  readonly stroke = input(2.2);

  protected readonly filled = computed(() => this.name() in FILLED);
  protected readonly d = computed(() => {
    const n = this.name();
    return n in FILLED ? FILLED[n as keyof typeof FILLED] : PATHS[n as keyof typeof PATHS];
  });
}
