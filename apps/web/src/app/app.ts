import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from './core/auth.service';
import { AiBanner } from './shared/ai-banner';
import { Icon } from './shared/icon';

/** Écrans plein écran sur mobile : ils ont leur propre barre d'actions en bas. */
const IMMERSIVE = ['/seance', '/seance-en-cours'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, AiBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  private readonly path = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.split('?')[0]),
    ),
    { initialValue: '' },
  );

  /** Écran de connexion : ni navigation ni compte affichés. */
  protected readonly bare = computed(() => this.path() === '/connexion');

  protected readonly immersive = computed(() => IMMERSIVE.includes(this.path()));
}
