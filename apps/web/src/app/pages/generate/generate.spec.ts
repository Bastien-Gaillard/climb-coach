import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GeneratedPlan, Schedule } from '../../core/models';
import { GeneratePage } from './generate';

const response: GeneratedPlan = {
  id: 'p1',
  source: 'rules',
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

  it('propose la vidéo des exercices, ou une recherche quand il n’y en a pas', () => {
    click('Générer');
    const withVideos = structuredClone(response);
    withVideos.plan.blocks[1].video = 'https://www.youtube.com/shorts/XvcQY3qJN1Y';
    withVideos.plan.blocks.push({
      kind: 'main',
      title: 'Endurance : Un bloc par minute',
      minutes: 10,
      instructions: ['Un bloc par minute'],
      video: 'https://www.youtube.com/results?search_query=emom',
    });
    http.expectOne('/api/plans/generate').flush(withVideos);
    fixture.detectChanges();

    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('[data-testid=video-link]'));
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      'Voir en vidéo',
      'Chercher une vidéo',
    ]);
    expect(links[0].href).toBe('https://www.youtube.com/shorts/XvcQY3qJN1Y');
    expect(links.every((a) => a.target === '_blank')).toBeTrue();
  });

  it('consigne du jour : affichée avec son ⓘ, « Changer » la remplace sans toucher au reste', () => {
    click('Générer');
    const withCue = structuredClone(response);
    withCue.plan.cue = {
      id: 'silent-feet',
      text: 'Pieds silencieux',
      info: { why: 'Précision', how: ['Regarde le pied'], pitfalls: ['Aller vite'] },
    };
    http.expectOne('/api/plans/generate').flush(withCue);
    fixture.detectChanges();

    const cue = () => el.querySelector('[data-testid=cue]')!;
    expect(cue().textContent).toContain('Pieds silencieux');
    expect(cue().querySelector('[data-testid=info]')?.textContent).toContain('Regarde le pied');

    el.querySelector<HTMLButtonElement>('[data-testid=cue-change]')!.click();
    const req = http.expectOne('/api/plans/cue/next');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'slow', text: 'Au ralenti : 3 temps par mouvement' });
    fixture.detectChanges();
    expect(cue().textContent).toContain('Au ralenti');
    expect(el.querySelector('[data-testid=plan]')!.textContent).toContain('Endurance : 4x4');
  });

  it('le bonus facultatif vient en plus du temps, avec son ⓘ et sa vidéo', () => {
    click('Générer');
    const withBonus = structuredClone(response);
    withBonus.plan.blocks.push({
      kind: 'bonus',
      title: 'Suspensions max',
      minutes: 10,
      instructions: ['6 à 10 suspensions de 10 s'],
      video: 'https://www.youtube.com/results?search_query=max+hangs',
      info: { why: 'Doigts', how: ['13 s au max'], pitfalls: ['Échec'] },
    });
    http.expectOne('/api/plans/generate').flush(withBonus);
    fixture.detectChanges();

    const plan = el.querySelector('[data-testid=plan]')!;
    expect(plan.textContent).toContain('Bonus · facultatif');
    expect(plan.textContent).toContain('Total : 60 min sur 60 min dispo.');
    expect(plan.textContent).toContain('+ 10 min de bonus facultatif.');
    const info = plan.querySelector('li.bonus [data-testid=info]')!;
    expect(info.textContent).toContain('13 s au max');
    expect(info.querySelector('[data-testid=video-link]')?.textContent?.trim()).toBe(
      'Chercher une vidéo',
    );
  });

  it('par défaut le planning décide, sinon envoie le type choisi', () => {
    const radio = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid=focus-${id}]`)!;
    expect(radio('auto').getAttribute('aria-checked')).toBe('true');

    radio('endurance').click();
    fixture.detectChanges();
    expect(radio('endurance').getAttribute('aria-checked')).toBe('true');
    expect(el.textContent).toContain('Séance d’endurance à la place de celle du planning');
    click('Générer');
    const req = http.expectOne('/api/plans/generate');
    expect(req.request.body).toEqual({ availableMinutes: 90, focus: 'endurance' });
    req.flush(response);
  });

  it('met la règle du format avant les couleurs, et l’objectif du jour en technique', () => {
    click('Générer');
    http.expectOne('/api/plans/generate').flush({
      ...response,
      plan: {
        ...response.plan,
        focus: 'technique',
        cue: { id: 'slow', text: 'Au ralenti' },
        blocks: [
          response.plan.blocks[0],
          { ...response.plan.blocks[1], title: 'Technique : Flash' },
        ],
      },
    });
    fixture.detectChanges();

    const main = el.querySelectorAll('.blocks > li')[1];
    expect(main.querySelector('[data-testid=block-focus]')?.textContent).toContain('Au ralenti');
    const html = main.innerHTML;
    expect(html.indexOf('4 blocs, 4 fois')).toBeLessThan(html.indexOf('Bloc · 6A'));
    // Plus de badge « Règles » ni « IA · Mistral » : toutes les séances viennent des règles
    expect(el.querySelector('[data-testid=plan] header .badge')).toBeNull();
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

    expect(el.querySelector('[data-testid=target-colors]')?.textContent).toContain('Bleu');
    expect(el.querySelector('h1')?.textContent).toContain('Salle Alpha');
    expect(localStorage.getItem('climb-coach.gym')).toBe('alpha-bloc');
  });

  it('affiche le volume avec ses couleurs et leur nuance, sans cotation Font', () => {
    click('Générer');
    const withVolumes = structuredClone(response);
    withVolumes.plan.blocks[1].instructions = ['Pose la pointe du chausson'];
    withVolumes.plan.blocks[1].target = {
      style: 'boulder',
      grade: '5+',
      volumes: [
        {
          count: '3 blocs',
          grade: '5+',
          colors: [
            { color: 'orange', hex: '#f97316' },
            { color: 'Difficile', hex: '#3b82f6', label: 'bleu facile' },
          ],
        },
        { count: '2 blocs', grade: '6A', colors: [{ color: 'rouge', hex: '#ef4444' }] },
      ],
    };
    http.expectOne('/api/plans/generate').flush(withVolumes);
    fixture.detectChanges();

    const rows = Array.from(el.querySelectorAll('[data-testid=target-volume]'));
    expect(rows.length).toBe(2);
    expect(Array.from(rows[0].querySelectorAll('.hold-chip')).map((c) => c.textContent)).toEqual([
      'Orange',
      'Bleu facile',
    ]);
    expect(rows[0].textContent).toContain('3 blocs');
    expect(rows[0].textContent).not.toContain('5+');
    expect(Array.from(rows[1].querySelectorAll('.hold-chip')).map((c) => c.textContent)).toEqual([
      'Rouge',
    ]);
    expect(rows[1].textContent).toContain('2 blocs');
    expect(rows[1].textContent).not.toContain('6A');
    expect(el.querySelector('[data-testid=target-colors]')).toBeNull();
    expect(el.querySelector('.blocks ul')?.textContent).not.toContain('3 blocs');
  });

  it('garde le volume dans un badge sans salle', () => {
    click('Générer');
    const noGym = structuredClone(response);
    noGym.plan.blocks[1].target = {
      style: 'boulder',
      grade: '6A',
      volumes: [{ count: '4 blocs', grade: '6A' }],
    };
    http.expectOne('/api/plans/generate').flush(noGym);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=target-volume]')?.textContent).toContain(
      '4 blocs · Bloc · 6A',
    );
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
