import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { EXAMPLE_GYMS } from '@climb-coach/grades';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { Database, DB } from '../src/db/db.module';
import { CLOCK } from '../src/plans/plans.service';

/**
 * Tests de bout en bout sur une vraie base Postgres.
 * DATABASE_URL doit pointer vers une base de test (vidée avant chaque test).
 */
describe('API (e2e)', () => {
  let app: INestApplication;
  let db: Database;
  const now = new Date('2025-11-29T18:00:00Z');

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://climb:climb@localhost:5432/climbcoach_test';
    process.env.MISTRAL_API_KEY = '';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue(() => now)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get(DB);
  });

  beforeEach(async () => {
    await db.execute(sql`TRUNCATE sessions, climbs, generated_plans, gyms CASCADE`);
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
      expect(res.body).toEqual({ id: expect.any(String), username: 'kuzimu' });
      const me = await http('tophe').get('/api/auth/me').expect(200);
      expect(me.body.username).toBe('tophe');
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
});
