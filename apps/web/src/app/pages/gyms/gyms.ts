import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { SCALES } from '@climb-coach/grades';
import { GymsStore } from '../../core/gyms.store';
import { errorMessage, STYLE_LABEL } from '../../core/labels';
import { Gym } from '../../core/models';
import { GymEditor } from './gym-editor';

@Component({
  selector: 'app-gyms',
  imports: [GymEditor],
  templateUrl: './gyms.html',
  styleUrl: './gyms.scss',
})
export class GymsPage implements OnInit {
  protected readonly store = inject(GymsStore);
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly scales = SCALES;

  /** 'new' pour une création, l'id d'une salle pour une modification, null sinon. */
  protected readonly editing = signal<'new' | string | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly editedGym = computed(() => {
    const id = this.editing();
    return id && id !== 'new' ? (this.store.find(id) ?? null) : null;
  });

  ngOnInit(): void {
    this.store.load();
  }

  protected startCreate(): void {
    this.editing.set('new');
  }

  protected startEdit(gym: Gym): void {
    this.editing.set(gym.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected close(): void {
    this.editing.set(null);
  }

  protected remove(gym: Gym): void {
    if (!confirm(`Supprimer « ${gym.name} » ? Les voies déjà saisies gardent leur cotation.`))
      return;
    this.error.set(null);
    this.store.remove(gym.id).subscribe({
      next: () => {
        if (this.editing() === gym.id) this.close();
      },
      error: (err) => this.error.set(errorMessage(err)),
    });
  }
}
