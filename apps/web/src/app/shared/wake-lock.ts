/** Sous-ensemble de l'API Screen Wake Lock (pas encore dans tous les typages du DOM). */
interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

/**
 * Garde l'écran allumé pendant la séance guidée. Le navigateur relâche le verrou quand la page
 * passe en arrière-plan : on le redemande à chaque retour au premier plan.
 * Sans support (vieux navigateur, http hors localhost), ne fait rien.
 */
export class ScreenWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private active = false;

  private readonly onVisible = () => {
    if (this.active && document.visibilityState === 'visible') void this.acquire();
  };

  enable(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('visibilitychange', this.onVisible);
    void this.acquire();
  }

  disable(): void {
    this.active = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    void this.sentinel?.release().catch(() => undefined);
    this.sentinel = null;
  }

  private async acquire(): Promise<void> {
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock || (this.sentinel && !this.sentinel.released)) return;
    try {
      this.sentinel = await wakeLock.request('screen');
    } catch {
      // refusé (batterie faible, page cachée) : le minuteur reste juste grâce à l'heure de fin
    }
  }
}
