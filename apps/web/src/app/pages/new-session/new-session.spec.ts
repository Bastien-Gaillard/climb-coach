import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { NewSessionPage } from './new-session';

describe('NewSessionPage', () => {
  let fixture: ComponentFixture<NewSessionPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const button = (text: string) => {
    const b = Array.from(el.querySelectorAll<HTMLButtonElement>('button')).find(
      (x) =>
        x.getAttribute('aria-label') === text ||
        x.textContent?.replace(/\s+/g, ' ').trim() === text,
    );
    if (!b) throw new Error(`Bouton « ${text} » introuvable`);
    return b;
  };
  const click = (text: string) => {
    button(text).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    localStorage.removeItem('climb-coach.lastGym');
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [NewSessionPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(NewSessionPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/gyms').flush(EXAMPLE_GYMS);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('ajoute une voie réussie en un toucher puis la corrige', () => {
    click('Ajouter jaune, 3 à 4');
    click('Ajouter rouge, 6A+ à 6B+');
    click('Ratée');
    click('+1essai');
    click('Encore');

    const feed = Array.from(el.querySelectorAll('.feed-list button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(feed).toEqual([
      'Voie 1, jaune, réussie, 1 essai',
      'Voie 2, rouge, ratée, 2 essais',
      'Voie 3, rouge, réussie, 1 essai',
    ]);
    expect(el.querySelector('.stats')?.textContent?.replace(/\s+/g, '')).toBe(
      '3voies2réussies4essais',
    );
  });

  it('enregistre la séance avec les voies par couleur et par cotation', () => {
    click('Ajouter vert, 4 à 5');
    click('Cotation');
    click('6C');
    click('Ratée');
    click('Terminer');
    click('Endurance');
    click('4, entamé');

    button('Enregistrer la séance').click();
    const req = http.expectOne('/api/sessions');
    expect(req.request.body.focus).toBe('endurance');
    expect(req.request.body.fatigue).toBe(4);
    expect(req.request.body.climbs).toEqual([
      { style: 'boulder', sent: true, attempts: 1, color: 'vert', gymId: 'alpha-bloc' },
      { style: 'boulder', sent: false, attempts: 1, grade: '6C', system: 'font' },
    ]);
    req.flush({});
  });

  it('retire la voie sélectionnée', () => {
    click('Ajouter jaune, 3 à 4');
    click('Ajouter vert, 4 à 5');
    click('Retirer');
    expect(el.querySelectorAll('.feed-list button').length).toBe(1);
  });
});
