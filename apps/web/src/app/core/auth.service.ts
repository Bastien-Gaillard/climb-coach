import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { PlanStore } from './plan.store';

const KEY = 'climb-coach.user';

export interface Account {
  id: string;
  username: string;
}

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Compte connecté, mémorisé sur l'appareil : on ne se connecte qu'une fois.
 * Pas de mot de passe, l'appli n'est joignable que via Tailscale.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly plans = inject(PlanStore);

  readonly username = signal<string | null>(read());

  login(username: string): Observable<Account> {
    return this.http
      .post<Account>('/api/auth/login', { username })
      .pipe(tap((account) => this.remember(account.username)));
  }

  /** Oublie le compte sur cet appareil et revient à l'écran de connexion. */
  logout(): void {
    this.remember(null);
    // La séance générée appartient au compte qui part
    this.plans.set(null);
    void this.router.navigateByUrl('/connexion');
  }

  private remember(username: string | null): void {
    this.username.set(username);
    try {
      if (username) localStorage.setItem(KEY, username);
      else localStorage.removeItem(KEY);
    } catch {
      // stockage indisponible (navigation privée stricte) : on reste connecté pour la session
    }
  }
}
