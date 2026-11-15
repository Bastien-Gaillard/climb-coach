import { Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { errorMessage } from '../../core/labels';
import { Equipment, Profile } from '../../core/models';
import { Icon } from '../../shared/icon';

interface EquipmentOption {
  id: Equipment;
  label: string;
  hint: string;
}

/** Même ordre que l'API. */
export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: 'elastic',
    label: 'Élastique',
    hint: 'Rotations des épaules à l’élastique',
  },
  {
    id: 'ball',
    label: 'Balle souple',
    hint: 'Pressions pour réveiller les doigts',
  },
  {
    id: 'hangboard',
    label: 'Poutre',
    hint: 'Suspensions progressives, et avant la force',
  },
  {
    id: 'pullup-bar',
    label: 'Barre de traction',
    hint: 'Tirages d’omoplates à la barre',
  },
];

/** Profil : le matériel disponible, que l'échauffement utilise quand il est coché. */
@Component({
  selector: 'app-profile',
  imports: [Icon],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class ProfilePage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly auth = inject(AuthService);

  protected readonly options = EQUIPMENT_OPTIONS;
  protected readonly profile = signal<Profile | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);

  ngOnInit(): void {
    this.api.profile().subscribe({
      next: (p) => this.profile.set(p),
      error: (err) => this.error.set(errorMessage(err)),
    });
  }

  protected has(id: Equipment): boolean {
    return this.profile()?.equipment.includes(id) ?? false;
  }

  /** Coche ou décoche, enregistré tout de suite (annulé si l'API refuse). */
  protected toggle(id: Equipment): void {
    const p = this.profile();
    if (!p || this.saving()) return;
    const set = new Set(p.equipment);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const equipment = EQUIPMENT_OPTIONS.map((o) => o.id).filter((e) => set.has(e));
    this.profile.set({ ...p, equipment });
    this.saving.set(true);
    this.error.set(null);
    this.api.updateSettings({ equipment }).subscribe({
      next: (saved) => {
        this.profile.set(saved);
        this.saving.set(false);
      },
      error: (err) => {
        this.profile.set(p);
        this.saving.set(false);
        this.error.set(errorMessage(err));
      },
    });
  }
}
