import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { FigureId, FIGURES } from './figures';

/** Schéma d'un exercice (voir {@link FIGURES}). */
@Component({
  selector: 'app-figure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'label()', '[attr.title]': 'label()' },
  template: `<svg viewBox="0 0 120 80" [innerHTML]="svg()"></svg>`,
  styles: `
    :host {
      --fig-ink: var(--ink);
      --fig-hi: #c45a2c;
      --fig-wall: var(--surface-2);
      --fig-hold: var(--line-strong);
      display: inline-flex;
      flex: none;
      width: 72px;
      aspect-ratio: 3 / 2;
      border-radius: 10px;
      background: var(--surface);
      box-shadow: inset 0 0 0 1px var(--line);
      overflow: hidden;
    }
    svg {
      width: 100%;
      height: 100%;
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    svg ::ng-deep {
      .b {
        stroke: var(--fig-ink);
        stroke-width: 6.5;
      }
      .hi {
        stroke: var(--fig-hi);
      }
      .ghost {
        stroke: var(--fig-hold);
        opacity: 0.6;
      }
      .t {
        stroke: var(--fig-hi);
        stroke-width: 12;
      }
      .h {
        fill: var(--fig-ink);
      }
      .p {
        fill: var(--fig-hold);
      }
      .w {
        fill: var(--fig-wall);
      }
      .g {
        stroke: var(--fig-hold);
        stroke-width: 4;
      }
      .a {
        stroke: var(--fig-ink);
        stroke-width: 2.6;
        opacity: 0.75;
      }
      .dash {
        stroke-dasharray: 4 4;
      }
      .target {
        fill: none;
        stroke: var(--fig-hi);
        stroke-width: 3;
      }
      .clock {
        stroke: var(--fig-ink);
        stroke-width: 3.5;
      }
      .shoe {
        stroke: var(--fig-ink);
        stroke-width: 9;
      }
      .x {
        fill: var(--fig-ink);
        font-family: var(--font-num);
        font-weight: 700;
      }
    }
  `,
})
export class Figure {
  private readonly sanitizer = inject(DomSanitizer);
  readonly name = input.required<FigureId>();

  protected readonly label = computed(() => FIGURES[this.name()].label);
  // Contenu statique défini dans le code (aucune donnée utilisateur) : sûr à injecter
  protected readonly svg = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(FIGURES[this.name()].svg),
  );
}
