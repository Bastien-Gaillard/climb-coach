import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { videoLabel } from '../core/labels';
import { PlanInfo } from '../core/models';
import { Icon } from './icon';

/**
 * Le ⓘ d'un exercice : replié par défaut pour garder l'écran lisible en salle, il déplie le
 * pourquoi, le comment, les pièges et la vidéo.
 */
@Component({
  selector: 'app-info',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="info" data-testid="info">
      <summary aria-label="Plus d’informations">
        <span class="i" aria-hidden="true">i</span><span class="label">{{ label() }}</span>
      </summary>
      <div class="body">
        <p class="why">{{ info().why }}</p>
        @if (info().how.length) {
          <span class="overline">Comment</span>
          <ul>
            @for (line of info().how; track $index) {
              <li>{{ line }}</li>
            }
          </ul>
        }
        @if (info().pitfalls.length) {
          <span class="overline">À éviter</span>
          <ul>
            @for (line of info().pitfalls; track $index) {
              <li>{{ line }}</li>
            }
          </ul>
        }
        @if (video(); as v) {
          <a
            class="video"
            [href]="v"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="video-link"
            ><app-icon name="play" [size]="14" />{{ videoLabel(v) }}</a
          >
        }
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    summary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-height: 32px;
      cursor: pointer;
      list-style: none;
      font-size: 14px;
      color: var(--ink-2);
    }
    summary::-webkit-details-marker {
      display: none;
    }
    .i {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1.5px solid currentColor;
      font-family: Georgia, serif;
      font-style: italic;
      font-weight: 700;
      font-size: 13px;
    }
    details[open] .label {
      display: none;
    }
    .body {
      display: grid;
      gap: 6px;
      margin-top: 6px;
      padding: 10px 12px;
      border-radius: var(--r-s);
      background: var(--surface-2);
      font-size: 14px;
    }
    .why {
      margin: 0;
      font-weight: 600;
    }
    .overline {
      font-size: 11px;
    }
    ul {
      margin: 0;
      padding-left: 18px;
    }
    .video {
      justify-self: start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      color: inherit;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  `,
})
export class InfoPanel {
  readonly info = input.required<PlanInfo>();
  readonly video = input<string>();
  /** Texte à côté du ⓘ, replié. */
  readonly label = input('Comment faire');
  protected readonly videoLabel = videoLabel;
}
