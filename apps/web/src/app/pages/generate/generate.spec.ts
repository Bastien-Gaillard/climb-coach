import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GeneratedPlan, Schedule } from '../../core/models';
import { GeneratePage } from './generate';

const response: GeneratedPlan = {
  id: 'p1',
  source: 'rules',
  fallbackReason: 'Timeout',
  availableMinutes: 60,
  createdAt: '2025-12-21T10:00:00Z',
  plan: {
    focus: 'endurance',
    intensity: 'normal',
    summary: 'On alterne avec de l’endurance.',
    blocks: [
      { kind: 'warmup', title: 'Échauffement', minutes: 12, instructions: ['Mobilité'] },
      {
        kind: 'main',
        title: 'Endurance : 4x4',
        minutes: 48,
        instructions: ['4 blocs, 4 fois'],
        target: { style: 'boulder', grade: '6A' },
      },
    ],
  },
};

const emptySchedule: Schedule = {
  today: '2026-11-12',
  source: 'rules',
  sessionsPerWeek: 3,
  basedOn: null,
  sessions: [],
};

describe('GeneratePage', () => {
  let fixture: ComponentFixture<GeneratePage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  /** Planning chargé à l'ouverture (vide par défaut : pas de suggestion). */
  const flushSchedule = (schedule: Schedule = emptySchedule) =>
    http.expectOne((r) => r.url === '/api/plans/schedule').flush(schedule);

  /** Bouton par son libellé visible (début du texte) ou son aria-label. */
  const click = (text: string) => {
    Array.from(el.querySelectorAll('button'))
      .find(
        (b) =>
          b.getAttribute('aria-label') === text ||
          b.textContent?.replace(/\s+/g, ' ').trim().startsWith(text),
      )!
      .click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [GeneratePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(GeneratePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    // Dernière séance, affichée dans « Pris en compte »
    http.expectOne((r) => r.url === '/api/sessions').flush([]);
    flushSchedule();
    http.expectOne('/api/gyms').flush([]);
  });

  afterEach(() => {
    // Après une génération par les règles, la page vérifie l'état de Mistral
    http
      .match((r) => r.url === '/api/plans/ai-status')
      .forEach((r) => r.flush({ enabled: true, state: 'ok' }));
    http.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('envoie le temps choisi et affiche la séance', () => {
    click('60 min');
    click('Générer');

    const req = http.expectOne('/api/plans/generate');
    expect(req.request.body).toEqual({ availableMinutes: 60 });
    req.flush(response);
    fixture.detectChanges();

    const plan = el.querySelector('[data-testid=plan]')!;
    expect(plan.textContent).toContain('Endurance : 4x4');
    expect(plan.textContent).toContain('Bloc · 6A');
    expect(plan.textContent).toContain('Total : 60 min');
  });

  it('signale quand les règles ont pris le relais de Mistral', () => {
    click('Générer');
    http.expectOne('/api/plans/generate').flush(response);
    fixture.detectChanges();

    expect(el.querySelector('.badge.line')?.textContent?.trim()).toBe('Règles');
    expect(el.textContent).toContain("Mistral n'a pas pu répondre (Timeout)");
  });

  it('rappelle la dernière séance prise en compte', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GeneratePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(GeneratePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/sessions')
      .flush([
        {
          id: 's1',
          date: new Date().toISOString(),
          durationMinutes: 60,
          focus: 'endurance',
          fatigue: 4,
          notes: null,
          climbs: [
            {
              id: 'c1',
              style: 'boulder',
              grade: '6A',
              gradeValue: 8,
              color: null,
              gymId: null,
              sent: true,
              attempts: 1,
            },
            {
              id: 'c2',
              style: 'boulder',
              grade: '6B+',
              gradeValue: 11,
              color: null,
              gymId: null,
              sent: true,
              attempts: 2,
            },
            {
              id: 'c3',
              style: 'boulder',
              grade: '7A',
              gradeValue: 14,
              color: null,
              gymId: null,
              sent: false,
              attempts: 4,
            },
          ],
        },
      ]);
    flushSchedule();
    http.expectOne('/api/gyms').flush([]);
    fixture.detectChanges();
    const text = el.querySelector('.context')?.textContent?.replace(/\s+/g, ' ');
    expect(text).toContain('endurance');
    expect(text).toContain('4/5');
    expect(text).toContain('6B+');
  });

  it('envoie la salle choisie et affiche les couleurs à faire', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GeneratePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(GeneratePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/sessions').flush([]);
    flushSchedule();
    http.expectOne('/api/gyms').flush([
      {
        id: 'alpha-bloc',
        name: 'Salle Alpha',
        discipline: 'boulder',
        system: 'font',
        colors: [{ color: 'bleu', hex: '#3b82f6', min: '5+', max: '6A' }],
      },
    ]);
    fixture.detectChanges();

    const select = el.querySelector<HTMLSelectElement>('.gym-select')!;
    select.value = 'alpha-bloc';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    click('Générer');

    const req = http.expectOne('/api/plans/generate');
    expect(req.request.body).toEqual({ availableMinutes: 90, gymId: 'alpha-bloc' });
    const withColors = structuredClone(response);
    withColors.gym = { id: 'alpha-bloc', name: 'Salle Alpha' };
    withColors.plan.blocks[1].target!.colors = [{ color: 'bleu', hex: '#3b82f6' }];
    req.flush(withColors);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid=target-colors]')?.textContent).toContain('bleu');
    expect(el.querySelector('h1')?.textContent).toContain('Salle Alpha');
    expect(localStorage.getItem('climb-coach.gym')).toBe('alpha-bloc');
  });

  it('propose la durée idéale de la séance conseillée aujourd’hui', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [GeneratePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(GeneratePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/sessions').flush([]);
    flushSchedule({
      today: '2026-11-12',
      source: 'rules',
      sessionsPerWeek: 3,
      basedOn: null,
      sessions: [
        {
          date: '2026-11-12',
          inDays: 0,
          focus: 'technique',
          durationMinutes: 120,
          intensity: 'normal',
          reason: '2 jours de récup après l’endurance',
          source: 'rules',
        },
      ],
    });
    http.expectOne('/api/gyms').flush([]);
    fixture.detectChanges();

    const advice = el.querySelector('[data-testid=advice]')?.textContent?.replace(/\s+/g, ' ');
    expect(advice).toContain('Technique');
    expect(advice).toContain('2 h');
    click('Générer');
    expect(http.expectOne('/api/plans/generate').request.body).toEqual({ availableMinutes: 120 });
  });

  it('affiche l’erreur de l’API', () => {
    click('Générer');
    http
      .expectOne('/api/plans/generate')
      .flush({ message: 'Requête invalide' }, { status: 400, statusText: 'Bad Request' });
    fixture.detectChanges();

    expect(el.querySelector('.error')?.textContent).toContain('Requête invalide');
  });
});
