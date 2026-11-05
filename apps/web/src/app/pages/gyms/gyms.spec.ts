import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EXAMPLE_GYMS } from '@climb-coach/grades';
import { hexForName } from './gym-editor';
import { GymsPage } from './gyms';

describe('GymsPage', () => {
  let fixture: ComponentFixture<GymsPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const click = (text: string) => {
    const button = Array.from(el.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === text,
    );
    if (!button) throw new Error(`Bouton « ${text} » introuvable`);
    button.click();
    fixture.detectChanges();
  };

  const type = (input: HTMLInputElement, value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GymsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(GymsPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('affiche un état vide puis crée une salle', () => {
    http.expectOne('/api/gyms').flush([]);
    fixture.detectChanges();
    expect(el.textContent).toContain('Aucune salle');

    click('Ajouter');
    type(el.querySelector('input[formcontrolname=name]')!, 'Bloc Session Digne');
    type(el.querySelector('input[aria-label="Nom de la couleur"]')!, 'jaune');
    click('Créer la salle');

    const req = http.expectOne('/api/gyms');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Bloc Session Digne',
      discipline: 'boulder',
      system: 'font',
      colors: [{ color: 'jaune', hex: '#f2c230', min: '4', max: '5+' }],
    });
    req.flush({ id: 'bloc-session-digne', ...req.request.body });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid=gym-editor]')).toBeNull();
    expect(el.textContent).toContain('Bloc Session Digne');
  });

  it('pré-remplit l’éditeur avec la salle à modifier et envoie un PUT', () => {
    http.expectOne('/api/gyms').flush(EXAMPLE_GYMS);
    fixture.detectChanges();

    el.querySelector<HTMLButtonElement>(
      'button[aria-label="Modifier Salle Alpha (bloc)"]',
    )!.click();
    fixture.detectChanges();
    const name = el.querySelector<HTMLInputElement>('input[formcontrolname=name]')!;
    expect(name.value).toBe('Salle Alpha (bloc)');
    expect(el.querySelectorAll('input[aria-label="Nom de la couleur"]').length).toBe(6);

    type(name, 'Alpha');
    click('Enregistrer');
    const req = http.expectOne('/api/gyms/alpha-bloc');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Alpha');
    expect(req.request.body.colors.length).toBe(6);
    req.flush({ ...EXAMPLE_GYMS[0], name: 'Alpha' });
  });

  it('bloque l’enregistrement quand une plage est à l’envers', () => {
    http.expectOne('/api/gyms').flush([]);
    click('Ajouter');
    type(el.querySelector('input[formcontrolname=name]')!, 'Test');
    type(el.querySelector('input[aria-label="Nom de la couleur"]')!, 'vert');
    const min = el.querySelector<HTMLSelectElement>('select[aria-label="Cotation min"]')!;
    min.value = '7A';
    min.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(el.textContent).toContain('Le min dépasse le max');
    expect(el.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBeTrue();
  });

  it('affiche l’erreur renvoyée par l’API', () => {
    http.expectOne('/api/gyms').flush([]);
    click('Ajouter');
    type(el.querySelector('input[formcontrolname=name]')!, 'Test');
    type(el.querySelector('input[aria-label="Nom de la couleur"]')!, 'vert');
    click('Créer la salle');
    http
      .expectOne('/api/gyms')
      .flush(
        { message: 'Salle test : couleur en double' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();
    expect(el.querySelector('.error')?.textContent).toContain('couleur en double');
  });
});

describe('hexForName', () => {
  it('propose une couleur d’après le nom', () => {
    expect(hexForName('Noir')).toBe('#1a1a1a');
    expect(hexForName('vert clair')).toBe('#2e9e5b');
    expect(hexForName('fluo')).toBeUndefined();
  });
});
