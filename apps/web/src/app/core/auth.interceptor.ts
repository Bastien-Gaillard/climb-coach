import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Ajoute le compte connecté à chaque appel de l'API, et renvoie à la connexion s'il est refusé. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const username = auth.username();
  const withUser = username ? req.clone({ setHeaders: { 'X-User': username } }) : req;

  return next(withUser).pipe(
    catchError((err: unknown) => {
      const isLogin = req.url.endsWith('/auth/login');
      if (err instanceof HttpErrorResponse && err.status === 401 && !isLogin) auth.logout();
      return throwError(() => err);
    }),
  );
};
