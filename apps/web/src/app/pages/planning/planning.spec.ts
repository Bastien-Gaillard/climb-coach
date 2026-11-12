import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Schedule } from '../../core/models';
import { PlanningPage } from './planning';

const schedule = (perWeek: number, inDays: number): Schedule => ({
  today: '2026-11-12',
  source: 'rules',
  sessionsPerWeek: perWeek,
  basedOn: { date: '2026-11-12', focus: 'endurance', durationMinutes: 90, fatigue: 3 },
  sessions: [
    {
      date: '2026-11-14',
      inDays,
      focus: 'technique',
      durationMinutes: 120,
      intensity: 'normal',
      reason: 'Récup après l’endurance',
    },
  ],
});

describe('PlanningPage', () => {
  let fixture: ComponentFixture<PlanningPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlanningPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    fixture = TestBed.createComponent(PlanningPage);
    http = TestBed.inject(HttpTestingController);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/plans/schedule').flush(schedule(3, 2));
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('affiche 7 jours, séances et repos', () => {
    const days = el.querySelectorAll('[data-testid=planning] > li');
    expect(days.length).toBe(7);
    expect(days[2].textContent).toContain('Technique');
    expect(days[2].textContent).toContain('2 h');
    expect(days[0].textContent).toContain('Repos');
  });

  it('signale la séance décidée par Mistral', () => {
    fixture = TestBed.createComponent(PlanningPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush({ ...schedule(3, 2), source: 'mistral' });
    fixture.detectChanges();
    const days = el.querySelectorAll('[data-testid=planning] > li');
    expect(days[2].querySelector('.ai')?.textContent).toContain('IA');
  });

  it('prolonge l’affichage quand la prochaine séance est loin (blessure)', () => {
    fixture = TestBed.createComponent(PlanningPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush({ ...schedule(3, 10), source: 'mistral' });
    fixture.detectChanges();
    const days = el.querySelectorAll('[data-testid=planning] > li');
    expect(days.length).toBe(11);
    expect(days[10].textContent).toContain('Technique');
  });

  it('se met à jour quand Mistral a fini de relire les notes', fakeAsync(() => {
    fixture = TestBed.createComponent(PlanningPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush({ ...schedule(3, 2), advicePending: true });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=advice-pending]')).not.toBeNull();

    tick(6000);
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush({ ...schedule(3, 7), source: 'mistral' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=advice-pending]')).toBeNull();
    expect(
      el.querySelectorAll('[data-testid=planning] > li')[7].querySelector('.ai'),
    ).not.toBeNull();
    tick(10000);
    http.expectNone((r) => r.url === '/api/plans/schedule');
  }));

  it('enregistre le rythme puis recalcule le planning', () => {
    const checked = () => el.querySelector('.seg [aria-checked=true]')?.textContent?.trim();
    expect(checked()).toBe('3');

    const four = Array.from(el.querySelectorAll<HTMLButtonElement>('.seg button')).find(
      (b) => b.textContent?.trim() === '4',
    )!;
    four.click();
    fixture.detectChanges();

    const req = http.expectOne('/api/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ sessionsPerWeek: 4 });
    req.flush({ id: 'u1', username: 'kuzimu', sessionsPerWeek: 4 });
    http.expectOne((r) => r.url === '/api/plans/schedule').flush(schedule(4, 1));
    fixture.detectChanges();

    expect(checked()).toBe('4');
    expect(el.querySelectorAll('[data-testid=planning] > li')[1].textContent).toContain(
      'Technique',
    );
  });
});
