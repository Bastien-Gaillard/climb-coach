import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BLOCK_LABEL, FOCUS_LABEL, STYLE_LABEL } from '../../core/labels';
import { PlanStore } from '../../core/plan.store';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';

/** Séance guidée : un bloc à la fois, minuteur lisible à 3 m, gros boutons. */
@Component({
  selector: 'app-live',
  imports: [Icon, RouterLink],
  templateUrl: './live.html',
  styleUrl: './live.scss',
})
export class LivePage implements OnInit {
  private readonly store = inject(PlanStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly styleLabel = STYLE_LABEL;
  protected readonly holdVars = holdVars;
  protected readonly generated = this.store.plan;
  protected readonly blocks = computed(() => this.generated()?.plan.blocks ?? []);

  protected readonly index = signal(0);
  protected readonly left = signal(0);
  protected readonly running = signal(true);
  protected readonly now = signal(Date.now());

  protected readonly block = computed(() => this.blocks()[this.index()]);
  protected readonly next = computed(() => this.blocks()[this.index() + 1] ?? null);
  protected readonly isLast = computed(() => this.index() >= this.blocks().length - 1);

  protected readonly kind = computed(() => {
    const b = this.block();
    if (!b) return '';
    const label = BLOCK_LABEL[b.kind];
    return b.kind === 'main' ? `${label} — ${FOCUS_LABEL[this.generated()!.plan.focus]}` : label;
  });

  protected readonly clock = computed(() => {
    const s = Math.max(0, this.left());
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  protected readonly progress = computed(() => {
    const total = (this.block()?.minutes ?? 1) * 60;
    return Math.min(100, Math.round((1 - this.left() / total) * 100));
  });

  protected readonly elapsed = computed(() => {
    const start = this.store.startedAt();
    return start ? Math.floor((this.now() - start) / 60000) : 0;
  });

  ngOnInit(): void {
    if (!this.generated()) {
      this.router.navigate(['/generer']);
      return;
    }
    this.store.start();
    const saved = this.store.timer();
    if (saved) {
      // Reprise : le minuteur a continué de tourner pendant la saisie
      const gone = saved.running ? Math.floor((Date.now() - saved.at) / 1000) : 0;
      this.index.set(saved.index);
      this.left.set(Math.max(0, saved.left - gone));
      this.running.set(saved.running);
    } else {
      this.go(0);
    }
    this.destroyRef.onDestroy(() =>
      this.store.timer.set({
        index: this.index(),
        left: this.left(),
        running: this.running(),
        at: Date.now(),
      }),
    );
    const timer = setInterval(() => {
      this.now.set(Date.now());
      if (!this.running()) return;
      if (this.left() > 0) this.left.update((s) => s - 1);
      else if (!this.isLast()) this.go(this.index() + 1);
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected go(i: number): void {
    const j = Math.max(0, Math.min(this.blocks().length - 1, i));
    this.index.set(j);
    this.left.set((this.blocks()[j]?.minutes ?? 0) * 60);
  }

  protected toggle(): void {
    this.running.update((r) => !r);
  }

  protected finish(): void {
    this.router.navigate(['/seance']);
  }
}
