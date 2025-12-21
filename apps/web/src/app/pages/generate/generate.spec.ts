import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GeneratedPlan } from '../../core/models';
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

describe('GeneratePage', () => {
  let fixture: ComponentFixture<GeneratePage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const click = (text: string) => {
    Array.from(el.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === text)!
      .click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [GeneratePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(GeneratePage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

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

    expect(el.textContent).toContain('⚙ Règles');
    expect(el.textContent).toContain('Mistral n\'a pas pu répondre (Timeout)');
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
