import { Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MobilityStep } from '../../core/models';
import { MobilityStore } from '../../core/mobility.store';
import { vibrate } from '../../core/push-alerts';
import { Icon } from '../../shared/icon';
import { InfoPanel } from '../../shared/info';
import { ScreenWakeLock } from '../../shared/wake-lock';

/**
 * Jour de pause : la routine souplesse (facultative, chez soi, sans matériel), servie par l'API.
 * D'abord la liste des exercices, puis un minuteur qui les enchaîne.
 */
@Component({
  selector: 'app-mobility',
  imports: [Icon, InfoPanel, RouterLink],
  templateUrl: './mobility.html',
  styleUrl: './mobility.scss',
})
export class MobilityPage implements OnInit {
  private readonly store = inject(MobilityStore);
  private readonly destroyRef = inject(DestroyRef);
  private readonly wakeLock = new ScreenWakeLock();
  private timer?: ReturnType<typeof setInterval>;

  protected readonly routine = this.store.routine;
  protected readonly loadError = this.store.error;
  protected readonly steps = computed<MobilityStep[]>(() => this.routine()?.steps ?? []);

  /** Minuteur lancé (sinon : vue d'ensemble). */
  protected readonly started = signal(false);
  protected readonly index = signal(0);
  protected readonly running = signal(false);
  protected readonly now = signal(Date.now());
  /** Heure de fin de l'exercice en cours (ms) : juste même après une mise en veille. */
  private readonly endsAt = signal(0);
  private readonly pausedLeft = signal(0);
  /** Dernier signal vibré (fin d'exercice ou changement de côté), pour ne vibrer qu'une fois. */
  private buzzed = '';

  protected readonly step = computed(() => this.steps()[this.index()]);
  protected readonly next = computed(() => this.steps()[this.index() + 1] ?? null);
  protected readonly isLast = computed(() => this.index() >= this.steps().length - 1);

  protected readonly left = computed(() =>
    this.running()
      ? Math.max(0, Math.ceil((this.endsAt() - this.now()) / 1000))
      : this.pausedLeft(),
  );

  protected readonly clock = computed(() => {
    const s = this.left();
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  protected readonly progress = computed(() => {
    const total = this.step()?.seconds ?? 1;
    return Math.min(100, Math.round((1 - this.left() / total) * 100));
  });

  /** Exercice à faire des deux côtés : lequel en ce moment. */
  protected readonly side = computed(() => {
    const st = this.step();
    if (!st?.sides) return null;
    return this.left() > st.seconds / 2 ? 'Premier côté' : 'Change de côté';
  });

  protected readonly done = computed(() => this.isLast() && this.left() === 0);

  ngOnInit(): void {
    this.store.load();
    this.destroyRef.onDestroy(() => this.stop());
  }

  protected start(): void {
    if (!this.steps().length) return;
    this.started.set(true);
    this.go(0);
    this.running.set(true);
    this.wakeLock.enable();
    this.timer ??= setInterval(() => this.tick(), 1000);
    window.scrollTo?.({ top: 0 });
  }

  /** Avance l'horloge ; enchaîne les exercices terminés, même plusieurs après une veille. */
  protected tick(now = Date.now()): void {
    this.now.set(now);
    if (!this.running()) return;
    const steps = this.steps();
    let i = this.index();
    let end = this.endsAt();
    while (now >= end && i < steps.length - 1) {
      i++;
      end += steps[i].seconds * 1000;
    }
    if (i !== this.index()) {
      this.index.set(i);
      this.endsAt.set(end);
      this.buzz(`end-${i - 1}`);
    }
    const st = steps[i];
    if (now >= end) this.buzz(`end-${i}`);
    else if (st.sides && end - now <= (st.seconds / 2) * 1000) this.buzz(`side-${i}`);
  }

  private buzz(key: string): void {
    if (this.buzzed === key) return;
    this.buzzed = key;
    vibrate();
  }

  protected go(i: number): void {
    const steps = this.steps();
    const j = Math.max(0, Math.min(steps.length - 1, i));
    const seconds = steps[j].seconds;
    const now = Date.now();
    this.now.set(now);
    this.index.set(j);
    this.endsAt.set(now + seconds * 1000);
    this.pausedLeft.set(seconds);
  }

  protected toggle(): void {
    const now = Date.now();
    this.now.set(now);
    if (this.running()) {
      this.pausedLeft.set(this.left());
      this.running.set(false);
    } else {
      this.endsAt.set(now + this.pausedLeft() * 1000);
      this.running.set(true);
    }
  }

  /** Retour à la liste des exercices. */
  protected close(): void {
    this.stop();
    this.started.set(false);
    this.running.set(false);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.wakeLock.disable();
  }
}
