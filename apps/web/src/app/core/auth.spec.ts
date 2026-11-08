import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('Authentification', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.removeItem('climb-coach.user');
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => {
    ctrl.verify();
    localStorage.removeItem('climb-coach.user');
  });

  it('mémorise le compte après connexion', () => {
    auth.login('Kuzimu').subscribe();
    const req = ctrl.expectOne('/api/auth/login');
    expect(req.request.body).toEqual({ username: 'Kuzimu' });
    req.flush({ id: 'u1', username: 'kuzimu' });

    expect(auth.username()).toBe('kuzimu');
    expect(localStorage.getItem('climb-coach.user')).toBe('kuzimu');
  });

  it('envoie le compte connecté à chaque appel', () => {
    auth.username.set('tophe');
    http.get('/api/sessions').subscribe();
    expect(ctrl.expectOne('/api/sessions').request.headers.get('X-User')).toBe('tophe');
  });

  it('déconnecte et renvoie à la connexion si l’API refuse le compte', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);
    auth.username.set('ancien');

    http.get('/api/sessions').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/sessions').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(auth.username()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/connexion');
  });

  it('ne déconnecte pas sur un identifiant inconnu à la connexion', () => {
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl').and.resolveTo(true);

    auth.login('inconnu').subscribe({ error: () => undefined });
    ctrl.expectOne('/api/auth/login').flush('', { status: 401, statusText: 'Unauthorized' });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
