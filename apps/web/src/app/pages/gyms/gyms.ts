import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { SCALES } from '@climb-coach/grades';
import { GymsStore } from '../../core/gyms.store';
import { errorMessage, STYLE_LABEL } from '../../core/labels';
import { Gym } from '../../core/models';
import { holdVars } from '../../shared/hold';
import { Icon } from '../../shared/icon';
import { GymEditor } from './gym-editor';

@Component({
  selector: 'app-gyms',
  imports: [GymEditor, Icon],
  templateUrl: './gyms.html',
  styleUrl: './gyms.scss',
})
export class GymsPage implements OnInit {
  protected readonly store = inject(GymsStore);
  protected readonly styleLabel = STYLE_LABEL;
  protected readonly scales = SCALES;
  protected readonly holdVars = holdVars;

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
    window.scrollTo({ top: 0 });
  }

  /** Étendue de la salle : de la plus facile à la plus dure. */
  protected range(gym: Gym): string {
    const first = gym.colors[0];
    const last = gym.colors[gym.colors.length - 1];
    return first && last ? `${first.min} → ${last.max}` : '';
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
