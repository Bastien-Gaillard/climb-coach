import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected username = '';
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  submit(): void {
    const username = this.username.trim();
    if (!username) {
      this.error.set('Entre ton identifiant');
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.login(username).subscribe({
      next: () => void this.router.navigateByUrl('/generer'),
      error: (e: unknown) => {
        this.loading.set(false);
        this.error.set(
          e instanceof HttpErrorResponse && e.status === 401
            ? `Aucun compte « ${username} »`
            : 'Connexion impossible, réessaie dans un instant',
        );
      },
    });
  }
}
