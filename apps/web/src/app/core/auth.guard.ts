import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/** Pages réservées à un compte connecté. */
export const authGuard: CanActivateFn = () =>
  inject(AuthService).username() ? true : inject(Router).parseUrl('/connexion');

/** L'écran de connexion n'a plus de sens une fois connecté. */
export const guestGuard: CanActivateFn = () =>
  inject(AuthService).username() ? inject(Router).parseUrl('/generer') : true;
