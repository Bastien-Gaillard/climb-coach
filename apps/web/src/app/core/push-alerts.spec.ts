import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { GeneratedPlan } from './models';
import { PlanStore } from './plan.store';
import { alertsFor, PushAlerts } from './push-alerts';

const plan: GeneratedPlan = {
  id: 'p1',
  source: 'rules',
  availableMinutes: 60,
  createdAt: '2026-11-12T10:00:00Z',
  plan: {
    focus: 'technique',
    intensity: 'normal',
    summary: 'Technique',
    blocks: [
      { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: [] },
      { kind: 'main', title: 'Technique', minutes: 40, instructions: [] },
      { kind: 'cooldown', title: 'Retour au calme', minutes: 5, instructions: [] },
    ],
  },
};

describe('alertsFor', () => {
  const at = Date.UTC(2026, 10, 12, 18);

  it('annonce chaque fin de bloc à venir, avec le bloc suivant', () => {
    const alerts = alertsFor(plan, { index: 0, left: 600, running: true, at });
    expect(alerts.map((a) => (a.at - at) / 60_000)).toEqual([10, 50, 55]);
    expect(alerts[0]).toEqual(
      jasmine.objectContaining({
        title: 'Fin du bloc « Échauffement »',
        body: 'Ensuite : Technique · 40 min',
      }),
    );
    expect(alerts[2].title).toBe('Fin de séance');
  });

  it('part du bloc en cours', () => {
    const alerts = alertsFor(plan, { index: 2, left: 90, running: true, at });
    expect(alerts.length).toBe(1);
    expect(alerts[0].at).toBe(at + 90_000);
  });

  it('n’annonce rien en pause ou sans séance', () => {
    expect(alertsFor(plan, { index: 0, left: 600, running: false, at })).toEqual([]);
    expect(alertsFor(null, { index: 0, left: 600, running: true, at })).toEqual([]);
    expect(alertsFor(plan, null)).toEqual([]);
  });
});

describe('PushAlerts', () => {
  let http: HttpTestingController;
  let store: PlanStore;
  let push: PushAlerts;
  const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(PlanStore);
    push = TestBed.inject(PushAlerts);
    // Abonnement déjà fait (le vrai passe par le service worker et la permission)
    (push as unknown as { endpoint: string }).endpoint = endpoint;
    push.state.set('on');
  });

  afterEach(() => {
    http.verify();
    sessionStorage.clear();
  });

  /** Laisse tourner les effets puis la file d'envoi. */
  const flush = async () => {
    TestBed.tick();
    await new Promise((r) => setTimeout(r));
  };

  it('envoie les fins de bloc quand le minuteur tourne, et les annule à la pause', async () => {
    store.set(plan);
    store.saveTimer({ index: 0, left: 900, running: true, at: 1_000 });
    await flush();
    const req = http.expectOne('/api/push/alerts');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.endpoint).toBe(endpoint);
    expect(req.request.body.alerts.length).toBe(3);
    req.flush({ scheduled: 3 });

    store.saveTimer({ index: 0, left: 800, running: false, at: 101_000 });
    await flush();
    const pause = http.expectOne('/api/push/alerts');
    expect(pause.request.body.alerts).toEqual([]);
    pause.flush({ scheduled: 0 });
  });

  it('ne renvoie pas la même liste deux fois', async () => {
    store.set(plan);
    store.saveTimer({ index: 1, left: 60, running: true, at: 1_000 });
    await flush();
    http.expectOne('/api/push/alerts').flush({ scheduled: 2 });
    store.saveTimer({ index: 1, left: 60, running: true, at: 1_000 });
    await flush();
    http.expectNone('/api/push/alerts');
  });

  it('annule les alertes quand on quitte la séance', async () => {
    store.set(plan);
    store.saveTimer({ index: 0, left: 900, running: true, at: 1_000 });
    await flush();
    http.expectOne('/api/push/alerts').flush({ scheduled: 3 });
    push.stop();
    await flush();
    const req = http.expectOne('/api/push/alerts');
    expect(req.request.body.alerts).toEqual([]);
    req.flush({ scheduled: 0 });
  });

  it('ne contacte pas l’API tant que les notifications ne sont pas activées', async () => {
    push.state.set('ask');
    store.set(plan);
    store.saveTimer({ index: 0, left: 900, running: true, at: 1_000 });
    await flush();
    http.expectNone('/api/push/alerts');
  });
});
