import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PlannedSession, Schedule, Session } from '../../core/models';
import { PlanningPage } from './planning';

/** AAAA-MM-JJ local, décalé de `n` jours par rapport à aujourd'hui. */
function day(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const planned = (inDays: number, extra: Partial<PlannedSession> = {}): PlannedSession => ({
  date: day(inDays),
  inDays,
  focus: 'technique',
  durationMinutes: 120,
  intensity: 'normal',
  reason: 'Récup après l’endurance',
  source: 'rules',
  ...extra,
});

const schedule = (perWeek: number, sessions: PlannedSession[], extra: Partial<Schedule> = {}) =>
  ({
    today: day(0),
    source: 'rules',
    sessionsPerWeek: perWeek,
    basedOn: { date: day(0), focus: 'endurance', durationMinutes: 90, fatigue: 3 },
    sessions,
    ...extra,
  }) as Schedule;

const done: Session = {
  id: 's1',
  date: new Date().toISOString(),
  durationMinutes: 90,
  focus: 'endurance',
  fatigue: 3,
  notes: null,
  climbs: [],
};

describe('PlanningPage', () => {
  let fixture: ComponentFixture<PlanningPage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const open = (s: Schedule) => {
    fixture = TestBed.createComponent(PlanningPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne((r) => r.url === '/api/plans/schedule').flush(s);
    http.expectOne((r) => r.url === '/api/sessions').flush([done]);
    fixture.detectChanges();
  };
  const items = () => el.querySelectorAll('[data-testid=planning] > li');

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PlanningPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('affiche le mois : séance faite aujourd’hui et séances prévues', () => {
    open(schedule(3, [planned(2), planned(5, { focus: 'strength', durationMinutes: 60 })]));

    const today = el.querySelector('.cal-day.today')!;
    expect(today.classList).toContain('done');
    expect(el.querySelectorAll('.cal-day.planned').length).toBe(2);
    expect(el.querySelectorAll('.cal-row:not(.cal-head)').length).toBe(5);

    expect(items().length).toBe(2);
    expect(items()[0].textContent).toContain('Technique');
    expect(items()[0].textContent).toContain('2 h');
    expect(items()[1].textContent).toContain('Force');
  });

  it('badge IA sur chaque séance planifiée par Mistral, et son résumé du mois', () => {
    open(
      schedule(
        3,
        [planned(2, { source: 'mistral' }), planned(5, { source: 'mistral' }), planned(30)],
        {
          source: 'mistral',
          summary: 'Mois de reprise après ta blessure.',
        },
      ),
    );
    expect(el.querySelector('[data-testid=summary]')?.textContent).toContain('reprise');
    expect(items()[0].querySelector('.ai')).not.toBeNull();
    expect(items()[1].querySelector('.ai')).not.toBeNull();
    expect(el.querySelectorAll('.cal-day .ai-dot').length).toBe(2);
  });

  it('se met à jour quand Mistral a fini de préparer le mois', fakeAsync(() => {
    open(schedule(3, [planned(2)], { advicePending: true }));
    expect(el.querySelector('[data-testid=advice-pending]')).not.toBeNull();

    tick(6000);
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush(schedule(3, [planned(7, { source: 'mistral' })], { source: 'mistral' }));
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=advice-pending]')).toBeNull();
    expect(items()[0].querySelector('.ai')).not.toBeNull();
    tick(10000);
    http.expectNone((r) => r.url === '/api/plans/schedule');
  }));

  it('affiche la date du planning Mistral et le regénère sur demande', fakeAsync(() => {
    open(
      schedule(3, [planned(2, { source: 'mistral' })], {
        source: 'mistral',
        plannedAt: '2026-11-10T17:30:00Z',
      }),
    );
    expect(el.querySelector('[data-testid=plan-bar]')?.textContent).toContain(
      'Planning Mistral du',
    );

    (el.querySelector('[data-testid=regenerate]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=advice-pending]')).not.toBeNull();
    expect((el.querySelector('[data-testid=regenerate]') as HTMLButtonElement).disabled).toBe(true);

    const req = http.expectOne((r) => r.url === '/api/plans/schedule/regenerate');
    expect(req.request.method).toBe('POST');
    req.flush(schedule(3, [planned(2, { source: 'mistral' })], { advicePending: true }));
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush(schedule(3, [planned(2, { source: 'mistral' })], { advicePending: true }));
    tick(6000);
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush(
        schedule(3, [planned(3, { source: 'mistral' })], {
          source: 'mistral',
          plannedAt: new Date().toISOString(),
        }),
      );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=advice-pending]')).toBeNull();
    expect((el.querySelector('[data-testid=regenerate]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  }));

  it('enregistre le rythme puis recalcule le planning', () => {
    open(schedule(3, [planned(2)]));
    const checked = () => el.querySelector('.seg [aria-checked=true]')?.textContent?.trim();
    expect(checked()).toBe('3');

    Array.from(el.querySelectorAll<HTMLButtonElement>('.seg button'))
      .find((b) => b.textContent?.trim() === '5')!
      .click();
    fixture.detectChanges();

    const req = http.expectOne('/api/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ sessionsPerWeek: 5 });
    req.flush({ id: 'u1', username: 'kuzimu', sessionsPerWeek: 5 });
    http
      .expectOne((r) => r.url === '/api/plans/schedule')
      .flush(schedule(5, [planned(1), planned(2), planned(4), planned(5)]));
    fixture.detectChanges();

    expect(checked()).toBe('5');
    expect(items().length).toBe(4);
  });
});
