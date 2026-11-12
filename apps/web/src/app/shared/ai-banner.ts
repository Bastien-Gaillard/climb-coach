import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit } from '@angular/core';
import { AiStatusStore } from '../core/ai-status.store';
import { Icon } from './icon';

const POLL_MS = 60_000;

/** Bannière affichée quand le quota Mistral est atteint (ou que Mistral ne répond plus). */
@Component({
  selector: 'app-ai-banner',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.banner(); as b) {
      <div class="ai-banner" [class.severe]="b.severe" role="status" data-testid="ai-banner">
        <app-icon name="generate" [size]="18" [stroke]="2.6" />
        <div class="txt">
          <strong>{{ b.title }}</strong>
          <span>{{ b.text }}</span>
        </div>
        <button type="button" class="ghost icon" aria-label="Fermer" (click)="store.dismiss()">
          <app-icon name="close" [size]="18" [stroke]="2.4" />
        </button>
      </div>
    }
  `,
  styles: `
    .ai-banner {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      position: relative;
      z-index: 1;
      margin-bottom: 14px;
      padding: 12px 8px 12px 14px;
      border-radius: var(--r-m);
      background: var(--surface-2);
      color: var(--ink);
      font-size: 14px;
      line-height: 1.4;
      box-shadow: inset 0 0 0 1px var(--line-strong);
    }
    .ai-banner.severe {
      background: #fbe3d6;
      color: #6b2a0e;
      box-shadow: inset 0 0 0 1px #e9a585;
    }
    :host-context([data-theme='dark']) .ai-banner.severe {
      background: #3a2017;
      color: #f6c7ad;
      box-shadow: inset 0 0 0 1px #7a3b22;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(:root:not([data-theme='light'])) .ai-banner.severe {
        background: #3a2017;
        color: #f6c7ad;
        box-shadow: inset 0 0 0 1px #7a3b22;
      }
    }
    app-icon {
      margin-top: 1px;
    }
    .txt {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    button {
      min-height: 0;
      height: 32px;
      width: 32px;
      padding: 0;
      color: inherit;
    }
  `,
})
export class AiBanner implements OnInit, OnDestroy {
  protected readonly store = inject(AiStatusStore);
  private timer?: ReturnType<typeof setInterval>;
  private readonly onVisible = () => document.visibilityState === 'visible' && this.store.refresh();

  ngOnInit(): void {
    this.store.refresh();
    this.timer = setInterval(() => this.store.refresh(), POLL_MS);
    document.addEventListener('visibilitychange', this.onVisible);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
