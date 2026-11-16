import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { EXAMPLE_GYMS } from '@climb-coach/grades';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Database, DB } from '../src/db/db.module';
import { CLOCK } from '../src/plans/plans.service';
import { PUSH_SENDER, PushTarget } from '../src/push/push.sender';
import { PushService } from '../src/push/push.service';

/**
 * Tests de bout en bout sur une vraie base Postgres.
 * DATABASE_URL doit pointer vers une base de test (vidée avant chaque test).
 */
describe('API (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  const now = new Date('2025-11-29T18:00:00Z');
  /** Faux service push : garde les messages au lieu de les envoyer. */
  const pushSender = {
    publicKey: 'cle-publique-test',
    sent: [] as { target: PushTarget; payload: unknown }[],
    fail: null as null | { statusCode: number },
    async send(target: PushTarget, payload: string) {
      if (this.fail) throw this.fail;
      this.sent.push({ target, payload: JSON.parse(payload) });
    },
  };

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://climb:climb@localhost:5432/climbcoach_test';
    process.env.MISTRAL_API_KEY = '';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(() => now)
      .overrideProvider(PUSH_SENDER)
      .useValue(pushSender)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DB);
  });

  beforeEach(async () => {
    await db.execute(
      sql`TRUNCATE sessions, climbs, generated_plans, gyms, push_subscriptions CASCADE`,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  /** Requêtes au nom d'un compte (kuzimu par défaut), via l'en-tête X-User. */
  const http = (user = 'kuzimu') => request.agent(app.getHttpServer()).set('X-User', user);
  const anonymous = () => request(app.getHttpServer());

  /** Crée une salle d'exemple via l'API et renvoie son id. */
  const createGym = async (exampleId: string) => {
    const { id: _id, ...body } = EXAMPLE_GYMS.find((g) => g.id === exampleId)!;
    const res = await http().post('/api/gyms').send(body).expect(201);
    return res.body.id as string;
  };

  it('GET /api/health', () => anonymous().get('/api/health').expect(200, { status: 'ok' }));

  describe('comptes', () => {
    const session = {
      date: '2025-11-27T19:00:00Z',
      durationMinutes: 60,
      focus: 'technique',
      fatigue: 2,
      climbs: [{ style: 'boulder', grade: '6A', sent: true }],
    };

    it('connecte un compte existant, sans tenir compte de la casse', async () => {
      const res = await anonymous()
        .post('/api/auth/login')
        .send({ username: ' Kuzimu ' })
        .expect(200);
      expect(res.body).toMatchObject({ id: expect.any(String), username: 'kuzimu' });
      const me = await http('tophe').get('/api/auth/me').expect(200);
      expect(me.body.username).toBe('tophe');
    });

    it('coche l’élastique par défaut et enregistre le matériel du profil', async () => {
      const me = await http('tophe').get('/api/auth/me').expect(200);
      expect(me.body.equipment).toEqual(['elastic']);
      const { body } = await http('tophe')
        .patch('/api/auth/me')
        .send({ equipment: ['hangboard', 'elastic'] })
        .expect(200);
      expect(body.equipment).toEqual(['elastic', 'hangboard']);
      expect(body.sessionsPerWeek).toBe(me.body.sessionsPerWeek);
      await http('tophe')
        .patch('/api/auth/me')
        .send({ equipment: ['trampoline'] })
        .expect(400);
    });

    it('enregistre les points faibles et ce qu’il aime, sans recouvrement', async () => {
      const me = await http('kuzimu').get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ weakPoints: [], likedPoints: [] });
      const { body } = await http('kuzimu')
        .patch('/api/auth/me')
        .send({ weakPoints: ['slab', 'crimps'], likedPoints: ['crimps', 'power'] })
        .expect(200);
      expect(body).toMatchObject({ weakPoints: ['crimps', 'slab'], likedPoints: ['power'] });
      // Cocher la dalle comme plaisir seulement : elle sort des points faibles
      const { body: liked } = await http('kuzimu')
        .patch('/api/auth/me')
        .send({ likedPoints: ['power', 'slab'] })
        .expect(200);
      expect(liked).toMatchObject({ weakPoints: ['crimps'], likedPoints: ['power', 'slab'] });
      await http('kuzimu')
        .patch('/api/auth/me')
        .send({ weakPoints: ['yoga'] })
        .expect(400);
      await http('kuzimu').post('/api/plans/generate').send({ availableMinutes: 90 }).expect(201);
    });

    it('enregistre l’objectif d’entraînement et dit quel type revient le plus', async () => {
      const me = await http('tophe').get('/api/auth/me').expect(200);
      expect(me.body).toMatchObject({ focusGoal: null, favoredFocus: null });
      const { body } = await http('tophe')
        .patch('/api/auth/me')
        .send({ focusGoal: 'strength', weakPoints: ['resistance'] })
        .expect(200);
      expect(body).toMatchObject({
        focusGoal: 'strength',
        favoredFocus: { focus: 'strength', source: 'goal' },
      });
      const { body: cleared } = await http('tophe')
        .patch('/api/auth/me')
        .send({ focusGoal: null })
        .expect(200);
      expect(cleared.favoredFocus).toEqual({ focus: 'endurance', source: 'weak-points' });
      await http('tophe').patch('/api/auth/me').send({ focusGoal: 'yoga' }).expect(400);
    });

    it('génère le type de séance choisi à la place du planning', async () => {
      const { body } = await http('tophe')
        .post('/api/plans/generate')
        .send({ availableMinutes: 90, focus: 'endurance' })
        .expect(201);
      expect(body.plan.focus).toBe('endurance');
      await http('tophe')
        .post('/api/plans/generate')
        .send({ availableMinutes: 90, focus: 'yoga' })
        .expect(400);
    });

    it('refuse un compte inconnu', async () => {
      await anonymous().post('/api/auth/login').send({ username: 'inconnu' }).expect(401);
      await http('inconnu').get('/api/sessions').expect(401);
    });

    it('refuse les requêtes sans compte', async () => {
      await anonymous().get('/api/sessions').expect(401);
      await anonymous().get('/api/gyms').expect(401);
    });

    it('sépare les séances de chaque compte', async () => {
      const { body: mine } = await http('kuzimu').post('/api/sessions').send(session).expect(201);

      expect((await http('kuzimu').get('/api/sessions').expect(200)).body).toHaveLength(1);
      expect((await http('tophe').get('/api/sessions').expect(200)).body).toHaveLength(0);
      expect((await http('tophe').get('/api/sessions/stats/progression').expect(200)).body).toEqual(
        [],
      );
      await http('tophe').get(`/api/sessions/${mine.id}`).expect(404);
      await http('tophe').delete(`/api/sessions/${mine.id}`).expect(404);
      await http('kuzimu').get(`/api/sessions/${mine.id}`).expect(200);
    });

    it('partage les salles entre les comptes', async () => {
      await createGym('alpha-bloc');
      expect((await http('tophe').get('/api/gyms').expect(200)).body).toHaveLength(1);
    });
  });

  describe('salles', () => {
    const body = {
      name: 'Bloc Session Digne',
      discipline: 'boulder',
      system: 'font',
      colors: [
        { color: 'jaune', hex: '#facc15', min: '4', max: '5' },
        { color: 'vert', hex: '#22c55e', min: '5+', max: '6A+' },
      ],
    };

    it('crée une salle avec un id lisible, puis un id unique pour un homonyme', async () => {
      const first = await http().post('/api/gyms').send(body).expect(201);
      expect(first.body.id).toBe('bloc-session-digne');
      const second = await http().post('/api/gyms').send(body).expect(201);
      expect(second.body.id).toBe('bloc-session-digne-2');
    });

    it('liste, lit, modifie et supprime', async () => {
      const { body: gym } = await http().post('/api/gyms').send(body).expect(201);

      expect((await http().get('/api/gyms').expect(200)).body).toHaveLength(1);

      const updated = await http()
        .put(`/api/gyms/${gym.id}`)
        .send({
          ...body,
          name: 'Bloc Session',
          colors: [...body.colors, { color: 'bleu', min: '6B', max: '6C' }],
        })
        .expect(200);
      expect(updated.body.colors).toHaveLength(3);
      expect((await http().get(`/api/gyms/${gym.id}`).expect(200)).body.name).toBe('Bloc Session');

      await http().delete(`/api/gyms/${gym.id}`).expect(204);
      await http().get(`/api/gyms/${gym.id}`).expect(404);
    });

    it('garde le niveau stable de chaque compte, et la force vise la couleur au-dessus', async () => {
      const digne = {
        ...body,
        name: 'Digne a Bloc',
        colors: [
          { color: 'vert', min: '5+', max: '6A' },
          { color: 'bleu', min: '6A+', max: '6B' },
          { color: 'rose', min: '6B+', max: '6C' },
        ],
      };
      const { body: gym } = await http()
        .post('/api/gyms')
        .send({ ...digne, myLevel: 'Bleu' })
        .expect(201);
      expect(gym.myLevel).toBe('bleu');
      // Salle partagée, niveau propre à chaque compte
      expect((await http('tophe').get(`/api/gyms/${gym.id}`).expect(200)).body.myLevel).toBeNull();
      await http('tophe')
        .put(`/api/gyms/${gym.id}`)
        .send({ ...digne, myLevel: 'vert' })
        .expect(200);
      const mine = (await http().get('/api/gyms').expect(200)).body;
      expect(mine[0].myLevel).toBe('bleu');
      // Sans myLevel, une modification de la salle garde le niveau
      await http().put(`/api/gyms/${gym.id}`).send(digne).expect(200);
      expect((await http().get(`/api/gyms/${gym.id}`).expect(200)).body.myLevel).toBe('bleu');
      await http()
        .put(`/api/gyms/${gym.id}`)
        .send({ ...digne, myLevel: 'noir' })
        .expect(400);

      const { body: plan } = await http()
        .post('/api/plans/generate')
        .send({ availableMinutes: 90, gymId: gym.id, focus: 'strength' })
        .expect(201);
      const main = plan.plan.blocks.filter((b: { kind: string }) => b.kind === 'main');
      expect(main[0].target.grade).toBe('6B+');
      expect(plan.plan.summary).toContain('Niveau stable déclaré à Digne a Bloc : bleu');

      await http()
        .put(`/api/gyms/${gym.id}`)
        .send({ ...digne, myLevel: null })
        .expect(200);
      expect((await http().get(`/api/gyms/${gym.id}`).expect(200)).body.myLevel).toBeNull();
    });

    it('refuse une plage incohérente avec un message clair', async () => {
      const res = await http()
        .post('/api/gyms')
        .send({ ...body, colors: [{ color: 'vert', min: '7A', max: '6A' }] })
        .expect(400);
      expect(res.body.message).toContain('min supérieur au max');
    });

    it('refuse une cotation qui n’est pas du système choisi', async () => {
      await http()
        .post('/api/gyms')
        .send({ ...body, system: 'french', colors: [{ color: 'vert', min: '6A', max: '6B' }] })
        .expect(400);
    });

    it('garde les voies déjà saisies quand on supprime la salle', async () => {
      const gymId = await createGym('alpha-bloc');
      const session = await http()
        .post('/api/sessions')
        .send({
          date: '2025-11-27T19:00:00Z',
          durationMinutes: 60,
          focus: 'technique',
          fatigue: 2,
          climbs: [{ style: 'boulder', color: 'rouge', gymId, sent: true }],
        })
        .expect(201);

      await http().delete(`/api/gyms/${gymId}`).expect(204);
      const res = await http().get(`/api/sessions/${session.body.id}`).expect(200);
      expect(res.body.climbs[0]).toMatchObject({ grade: '6B', color: 'rouge' });
    });
  });

  describe('séances', () => {
    let alphaId: string;
    beforeEach(async () => {
      alphaId = await createGym('alpha-bloc');
    });

    const body = {
      date: '2025-11-27T19:00:00Z',
      durationMinutes: 90,
      focus: 'strength',
      fatigue: 3,
      climbs: [
        { style: 'boulder', grade: 'V4', system: 'vscale', sent: true },
        { style: 'boulder', color: 'noir', gymId: 'salle-alpha-bloc', sent: false, attempts: 4 },
      ],
    };

    it('crée une séance et normalise les cotations', async () => {
      const res = await http().post('/api/sessions').send(body).expect(201);
      expect(res.body.climbs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ grade: '6B', color: null }),
          expect.objectContaining({
            grade: '6C+',
            color: 'noir',
            gymId: alphaId,
            attempts: 4,
          }),
        ]),
      );
    });

    it('liste, lit et supprime', async () => {
      const created = await http().post('/api/sessions').send(body).expect(201);
      const id = created.body.id;

      const list = await http().get('/api/sessions').expect(200);
      expect(list.body).toHaveLength(1);
      await http().get(`/api/sessions/${id}`).expect(200);
      await http().delete(`/api/sessions/${id}`).expect(204);
      await http().get(`/api/sessions/${id}`).expect(404);
    });

    it('renvoie une 400 détaillée sur un body invalide', async () => {
      const res = await http()
        .post('/api/sessions')
        .send({ ...body, fatigue: 8 })
        .expect(400);
      expect(res.body.errors).toEqual([expect.objectContaining({ path: 'fatigue' })]);
    });

    it('renvoie une 400 sur une couleur inconnue', async () => {
      await http()
        .post('/api/sessions')
        .send({
          ...body,
          climbs: [{ style: 'boulder', color: 'turquoise', gymId: alphaId, sent: true }],
        })
        .expect(400);
    });

    it('calcule la progression', async () => {
      await http().post('/api/sessions').send(body).expect(201);
      const res = await http().get('/api/sessions/stats/progression').expect(200);
      expect(res.body).toEqual([expect.objectContaining({ style: 'boulder', grade: '6B' })]);
    });
  });

  describe('génération', () => {
    it('génère une séance par les règles sans clé Mistral, et l’enregistre', async () => {
      await http()
        .post('/api/sessions')
        .send({
          date: '2025-11-27T19:00:00Z',
          durationMinutes: 90,
          focus: 'strength',
          fatigue: 3,
          climbs: [{ style: 'boulder', grade: '6C', sent: true }],
        })
        .expect(201);

      const res = await http()
        .post('/api/plans/generate')
        .send({ availableMinutes: 60 })
        .expect(201);
      expect(res.body.source).toBe('rules');
      expect(res.body.plan.focus).toBe('endurance');
      const total = res.body.plan.blocks.reduce(
        (s: number, b: { minutes: number }) => s + b.minutes,
        0,
      );
      expect(total).toBe(60);

      const history = await http().get('/api/plans').expect(200);
      expect(history.body).toHaveLength(1);
    });

    it('refuse moins de 30 min', () =>
      http().post('/api/plans/generate').send({ availableMinutes: 10 }).expect(400));
  });

  describe('cotations et salles', () => {
    it('convertit une cotation', () =>
      http()
        .get('/api/grades/convert')
        .query({ grade: '7a', from: 'french', to: 'yds' })
        .expect(200)
        .expect((res) => expect(res.body.result).toBe('5.11d')));

    it('convertit une couleur entre deux salles', async () => {
      const alpha = await createGym('alpha-bloc');
      const beta = await createGym('beta-bloc');
      const res = await http()
        .get(`/api/gyms/${alpha}/convert`)
        .query({ color: 'rouge', to: beta })
        .expect(200);
      expect(res.body.matches[0]).toEqual({ color: 'bleu', overlap: 0.67 });
    });

    it('renvoie une 404 sur une salle inconnue', () =>
      http().get('/api/gyms/inconnue').expect(404));
  });

  describe('notifications push', () => {
    const endpoint = 'https://fcm.googleapis.com/fcm/send/appareil-1';
    const subscription = { endpoint, keys: { p256dh: 'cle-p256dh', auth: 'cle-auth' } };
    let push: PushService;

    beforeAll(() => {
      push = app.get(PushService);
      // L'envoi automatique chaque seconde gênerait les tests : on l'appelle à la main
      push.onModuleDestroy();
    });

    beforeEach(() => {
      pushSender.sent = [];
      pushSender.fail = null;
    });

    it('donne la clé publique pour s’abonner', async () => {
      const { body } = await http().get('/api/push/key').expect(200);
      expect(body).toEqual({ publicKey: 'cle-publique-test' });
    });

    it('envoie la fin de bloc à l’heure prévue, puis la suivante', async () => {
      await http().post('/api/push/subscribe').send(subscription).expect(204);
      const t = Date.now();
      const alerts = [
        { at: t + 60_000, title: 'Échauffement terminé', body: 'Suivant : Technique · 40 min' },
        { at: t + 120_000, title: 'Séance terminée', body: '' },
      ];
      const { body } = await http().put('/api/push/alerts').send({ endpoint, alerts }).expect(200);
      expect(body).toEqual({ scheduled: 2 });

      expect(await push.dispatchDue(t + 30_000)).toBe(0);
      expect(await push.dispatchDue(t + 61_000)).toBe(1);
      expect(pushSender.sent[0].target).toMatchObject({ endpoint, p256dh: 'cle-p256dh' });
      expect(pushSender.sent[0].payload).toMatchObject({
        title: 'Échauffement terminé',
        url: '/seance-en-cours',
      });
      // Déjà partie : pas de doublon
      expect(await push.dispatchDue(t + 62_000)).toBe(0);
      expect(await push.dispatchDue(t + 121_000)).toBe(1);
      expect(pushSender.sent.map((m) => (m.payload as { title: string }).title)).toEqual([
        'Échauffement terminé',
        'Séance terminée',
      ]);
    });

    it('une liste vide annule les alertes (pause, fin de séance)', async () => {
      await http().post('/api/push/subscribe').send(subscription).expect(204);
      const t = Date.now();
      await http()
        .put('/api/push/alerts')
        .send({ endpoint, alerts: [{ at: t + 1000, title: 'Fin', body: '' }] })
        .expect(200);
      await http().put('/api/push/alerts').send({ endpoint, alerts: [] }).expect(200);
      expect(await push.dispatchDue(t + 5000)).toBe(0);
    });

    it('refuse de programmer sur l’appareil d’un autre compte', async () => {
      await http().post('/api/push/subscribe').send(subscription).expect(204);
      await http('tophe').put('/api/push/alerts').send({ endpoint, alerts: [] }).expect(404);
    });

    it('oublie un appareil désabonné chez le service push (410)', async () => {
      await http().post('/api/push/subscribe').send(subscription).expect(204);
      const t = Date.now();
      await http()
        .put('/api/push/alerts')
        .send({ endpoint, alerts: [{ at: t + 1000, title: 'Fin', body: '' }] })
        .expect(200);
      pushSender.fail = { statusCode: 410 };
      await push.dispatchDue(t + 2000);
      await http().put('/api/push/alerts').send({ endpoint, alerts: [] }).expect(404);
    });

    it('valide le corps des requêtes', async () => {
      await http().post('/api/push/subscribe').send({ endpoint: 'pas-une-url' }).expect(400);
      await anonymous().get('/api/push/key').expect(401);
    });
  });
});
