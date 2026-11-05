import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Icon } from './shared/icon';

/** Écrans plein écran sur mobile : ils ont leur propre barre d'actions en bas. */
const IMMERSIVE = ['/seance', '/seance-en-cours'];

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly router = inject(Router);

  protected readonly immersive = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map((e) => IMMERSIVE.some((p) => e.urlAfterRedirects.split('?')[0] === p)),
    ),
    { initialValue: false },
  );
}
