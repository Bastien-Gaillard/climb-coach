import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('affiche la navigation', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const links = (fixture.nativeElement as HTMLElement).querySelectorAll('nav a');
    expect(links.length).toBe(5);
    expect(Array.from(links).map((a) => a.getAttribute('href'))).toEqual([
      '/generer',
      '/historique',
      '/seance',
      '/salles',
      '/convertisseur',
    ]);
  });
});
