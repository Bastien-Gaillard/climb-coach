import { DatePipe } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { FONT, FRENCH } from '@climb-coach/grades';
import { STYLE_LABEL } from '../../core/labels';
import { ProgressionPoint, Style } from '../../core/models';

const W = 640;
const H = 220;
const PAD = { top: 16, right: 16, bottom: 28, left: 44 };
const SCALE_BY_STYLE = { boulder: FONT, route: FRENCH } as const;

/** Meilleure réussite par séance, en SVG simple (pas besoin d'une lib de graphiques). */
@Component({
  selector: 'app-progression-chart',
  imports: [DatePipe],
  template: `
    <div class="head">
      <h2>Progression</h2>
      @if (styles().length > 1) {
        <div class="toggle" role="group" aria-label="Style">
          @for (s of styles(); track s) {
            <button type="button" [class.selected]="style() === s" (click)="selected.set(s)">
              {{ styleLabel[s] }}
            </button>
          }
        </div>
      }
    </div>

    @if (series().length < 2) {
      <p class="muted">Encore quelques séances et la courbe apparaîtra ici.</p>
    } @else {
      <svg
        [attr.viewBox]="'0 0 ' + w + ' ' + h"
        role="img"
        aria-label="Meilleure réussite par séance"
      >
        @for (t of ticks(); track t.value) {
          <line
            [attr.x1]="pad.left"
            [attr.x2]="w - pad.right"
            [attr.y1]="t.y"
            [attr.y2]="t.y"
            class="grid"
          />
          <text [attr.x]="pad.left - 8" [attr.y]="t.y + 4" text-anchor="end">{{ t.label }}</text>
        }
        <polyline [attr.points]="line()" class="line" />
        @for (p of series(); track p.sessionId) {
          <circle [attr.cx]="p.x" [attr.cy]="p.y" r="4" class="dot">
            <title>{{ p.date | date: 'd MMM' }} : {{ p.grade }}</title>
          </circle>
        }
        <text [attr.x]="pad.left" [attr.y]="h - 6">{{ series()[0].date | date: 'd MMM' }}</text>
        <text [attr.x]="w - pad.right" [attr.y]="h - 6" text-anchor="end">
          {{ series()[series().length - 1].date | date: 'd MMM' }}
        </text>
      </svg>
    }
  `,
  styles: `
    .head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .head h2 {
      margin: 0;
    }
    .toggle {
      display: flex;
      gap: 0.25rem;
    }
    .toggle button.selected {
      background: var(--accent-soft);
      border-color: var(--accent);
      color: var(--accent);
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    text {
      font-size: 11px;
      fill: var(--muted);
    }
    .grid {
      stroke: var(--line);
      stroke-dasharray: 3 3;
    }
    .line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 2.5;
      stroke-linejoin: round;
    }
    .dot {
      fill: var(--surface);
      stroke: var(--accent);
      stroke-width: 2;
    }
  `,
})
export class ProgressionChart {
  readonly points = input.required<ProgressionPoint[]>();

  protected readonly w = W;
  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly selected = signal<Style | null>(null);

  protected readonly styles = computed(() => [...new Set(this.points().map((p) => p.style))]);
  /** Style affiché : celui choisi, sinon le plus fréquent. */
  protected readonly style = computed<Style>(() => {
    const chosen = this.selected();
    if (chosen && this.styles().includes(chosen)) return chosen;
    const boulders = this.points().filter((p) => p.style === 'boulder').length;
    return boulders >= this.points().length - boulders ? 'boulder' : 'route';
  });

  private readonly range = computed(() => {
    const values = this.points()
      .filter((p) => p.style === this.style())
      .map((p) => p.value);
    return { min: Math.floor(Math.min(...values)) - 1, max: Math.ceil(Math.max(...values)) + 1 };
  });

  protected readonly series = computed(() => {
    const pts = this.points().filter((p) => p.style === this.style());
    const { min, max } = this.range();
    const innerW = W - PAD.left - PAD.right;
    const innerH = H - PAD.top - PAD.bottom;
    return pts.map((p, i) => ({
      ...p,
      x: PAD.left + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW),
      y: PAD.top + innerH - ((p.value - min) / (max - min)) * innerH,
    }));
  });

  protected readonly line = computed(() =>
    this.series()
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  );

  protected readonly ticks = computed(() => {
    const { min, max } = this.range();
    const grades = SCALE_BY_STYLE[this.style()].grades;
    const innerH = H - PAD.top - PAD.bottom;
    const step = Math.max(1, Math.ceil((max - min) / 5));
    const ticks = [];
    for (let v = Math.max(0, min); v <= Math.min(grades.length - 1, max); v += step) {
      ticks.push({
        value: v,
        label: grades[v][0],
        y: PAD.top + innerH - ((v - min) / (max - min)) * innerH,
      });
    }
    return ticks;
  });
}
