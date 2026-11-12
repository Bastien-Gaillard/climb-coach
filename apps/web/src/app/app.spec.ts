import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { AuthService } from './core/auth.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    TestBed.inject(AuthService).username.set('kuzimu');
  });

  it('affiche la navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');
    expect(links.length).toBe(6);
    expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
      '/generer',
      '/planning',
      '/historique',
      '/seance',
      '/salles',
      '/convertisseur',
    ]);
  });

  it('affiche le compte connecté et permet d’en changer', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.top-account .who')?.textContent).toContain('kuzimu');
    expect(el.querySelector('.top-account .switch')?.textContent).toContain('Changer de compte');
  });
});
