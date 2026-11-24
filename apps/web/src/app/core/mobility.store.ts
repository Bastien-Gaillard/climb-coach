import { inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';
import { MobilityRoutine } from './models';

/** Routine souplesse des jours de pause : chargée une fois, partagée par le Planning et la page. */
@Injectable({ providedIn: 'root' })
export class MobilityStore {
  private readonly api = inject(ApiService);

  private readonly _routine = signal<MobilityRoutine | null>(null);
  private readonly _error = signal(false);
  private loading = false;

  readonly routine = this._routine.asReadonly();
  readonly error = this._error.asReadonly();

  /** Charge la routine si ce n'est pas déjà fait. */
  load(): void {
    if (this._routine() || this.loading) return;
    this.loading = true;
    this._error.set(false);
    this.api.mobility().subscribe({
      next: (r) => {
        this.loading = false;
        this._routine.set(r);
      },
      error: () => {
        this.loading = false;
        this._error.set(true);
      },
    });
  }
}
