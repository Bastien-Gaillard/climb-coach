import { Component, computed, DestroyRef, effect, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { BLOCK_LABEL, FOCUS_LABEL, STYLE_LABEL, videoLabel } from '../../core/labels';
import { PlanStore } from '../../core/plan.store';
import { PushAlerts, vibrate } from '../../core/push-alerts';
import { chipLabel, holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';
import { InfoPanel } from '../../shared/info';
import { ScreenWakeLock } from '../../shared/wake-lock';

/** Séance guidée : un bloc à la fois, minuteur lisible à 3 m, gros boutons. */
@Component({
  selector: 'app-live',
  imports: [Icon, InfoPanel, RouterLink],
  templateUrl: './live.html',
  styleUrl: './live.scss',
})
export class LivePage implements OnInit {
  private readonly store = inject(PlanStore);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  /** Notifications de fin de bloc, même téléphone verrouillé. */
  protected readonly push = inject(PushAlerts);

  protected readonly styleLabel = STYLE_LABEL;
  protected readonly holdVars = holdVars;
  protected readonly chipLabel = chipLabel;
  protected readonly videoLabel = videoLabel;
  protected readonly generated = this.store.plan;
  protected readonly blocks = computed(() => this.generated()?.plan.blocks ?? []);

  protected readonly index = signal(0);
  protected readonly running = signal(true);
  protected readonly now = signal(Date.now());
  /**
   * Heure de fin du bloc (ms) quand le minuteur tourne. Le temps restant se calcule depuis
   * l'horloge réelle : il reste juste même si le téléphone met la page en veille.
   */
  private readonly endsAt = signal(0);
  /** Secondes restantes figées pendant une pause. */
  private readonly pausedLeft = signal(0);
  private readonly wakeLock = new ScreenWakeLock();
  /** État restauré : avant ça, l'effet de sauvegarde écraserait la position enregistrée. */
  private readonly ready = signal(false);
  /** Heure de fin (ms) du dernier bloc signalé par une vibration. */
  private buzzedFor = 0;

  protected readonly left = computed(() =>
    this.running()
      ? Math.max(0, Math.ceil((this.endsAt() - this.now()) / 1000))
      : this.pausedLeft(),
  );

  protected readonly block = computed(() => this.blocks()[this.index()]);
  protected readonly next = computed(() => this.blocks()[this.index() + 1] ?? null);
  protected readonly isLast = computed(() => this.index() >= this.blocks().length - 1);
  /** Consigne du jour : rappelée pendant l'échauffement. */
  protected readonly cue = computed(() => this.generated()?.plan.cue ?? null);

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

  constructor() {
    // Sauvegarde à chaque changement d'état (pas à chaque seconde : l'heure de fin suffit)
    effect(() => {
      if (!this.ready() || !this.generated()) return;
      const running = this.running();
      this.store.saveTimer({
        index: this.index(),
        left: running
          ? Math.max(0, Math.ceil((this.endsAt() - Date.now()) / 1000))
          : this.pausedLeft(),
        running,
        at: Date.now(),
      });
    });
  }

  ngOnInit(): void {
    if (!this.generated()) {
      this.router.navigate(['/generer']);
      return;
    }
    this.store.start();
    this.push.resume();
    void this.push.init();
    const saved = this.store.timer();
    if (saved) {
      // Reprise : le minuteur a continué de tourner pendant la saisie ou la veille
      this.index.set(Math.min(saved.index, this.blocks().length - 1));
      this.running.set(saved.running);
      if (saved.running) this.endsAt.set(saved.at + saved.left * 1000);
      else this.pausedLeft.set(saved.left);
      this.tick();
    } else {
      this.go(0);
    }
    this.ready.set(true);

    this.wakeLock.enable();
    const timer = setInterval(() => this.tick(), 1000);
    // Retour de veille : mise à jour immédiate, sans attendre le prochain tick
    const onVisible = () => document.visibilityState === 'visible' && this.tick();
    document.addEventListener('visibilitychange', onVisible);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      this.wakeLock.disable();
    });
  }

  /** Avance l'horloge ; enchaîne les blocs terminés, y compris plusieurs d'un coup après une veille. */
  protected tick(now = Date.now()): void {
    this.now.set(now);
    if (!this.running()) return;
    let end = this.endsAt();
    let i = this.index();
    const last = this.blocks().length - 1;
    /** Fin du dernier bloc écoulé (0 si le bloc en cours n'est pas fini). */
    let passed = 0;
    while (now >= end && i < last) {
      passed = end;
      i++;
      end += (this.blocks()[i]?.minutes ?? 0) * 60_000;
    }
    if (now >= end) passed = end;
    if (i !== this.index()) {
      this.index.set(i);
      this.endsAt.set(end);
    }
    this.buzz(passed, now);
  }

  /**
   * Vibre à la fin d'un bloc, une seule fois. Pas au retour de veille pour une fin déjà
   * ancienne : la notification push l'a annoncée.
   */
  private buzz(passed: number, now: number): void {
    if (passed <= this.buzzedFor) return;
    this.buzzedFor = passed;
    if (now - passed < 5000) vibrate();
  }

  protected go(i: number): void {
    const j = Math.max(0, Math.min(this.blocks().length - 1, i));
    const seconds = (this.blocks()[j]?.minutes ?? 0) * 60;
    const now = Date.now();
    this.now.set(now);
    this.index.set(j);
    this.endsAt.set(now + seconds * 1000);
    this.pausedLeft.set(seconds);
  }

  /** « Passer le bonus » : saute tous les exercices facultatifs qui se suivent. */
  protected skipBonus(): void {
    let i = this.index();
    while (this.blocks()[i]?.kind === 'bonus') i++;
    this.go(i);
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

  protected finish(): void {
    this.push.stop();
    this.router.navigate(['/seance']);
  }
}
