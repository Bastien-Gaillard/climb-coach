import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Gym, GymInput, Style } from './models';

/** Salles chargées une fois et partagées entre les pages (formulaire, convertisseur, gestion). */
@Injectable({ providedIn: 'root' })
export class GymsStore {
  private readonly api = inject(ApiService);

  private readonly _gyms = signal<Gym[]>([]);
  private readonly _loaded = signal(false);

  readonly gyms = this._gyms.asReadonly();
  readonly loaded = this._loaded.asReadonly();
  readonly count = computed(() => this._gyms().length);

  /** Charge les salles si ce n'est pas déjà fait (ou force le rechargement). */
  load(force = false): void {
    if (this._loaded() && !force) return;
    this.api.listGyms().subscribe({
      next: (list) => {
        this._gyms.set(list);
        this._loaded.set(true);
      },
      error: () => this._loaded.set(true),
    });
  }

  byDiscipline(style: Style): Gym[] {
    return this._gyms().filter((g) => g.discipline === style);
  }

  find(id: string): Gym | undefined {
    return this._gyms().find((g) => g.id === id);
  }

  create(input: GymInput): Observable<Gym> {
    return this.api.createGym(input).pipe(tap((gym) => this.upsert(gym)));
  }

  update(id: string, input: GymInput): Observable<Gym> {
    return this.api.updateGym(id, input).pipe(tap((gym) => this.upsert(gym)));
  }

  remove(id: string): Observable<void> {
    return this.api
      .deleteGym(id)
      .pipe(tap(() => this._gyms.update((list) => list.filter((g) => g.id !== id))));
  }

  private upsert(gym: Gym): void {
    this._gyms.update((list) =>
      [...list.filter((g) => g.id !== gym.id), gym].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }
}
