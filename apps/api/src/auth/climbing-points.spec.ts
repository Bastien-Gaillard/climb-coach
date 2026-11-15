import { CLIMBING_POINTS, normalizePreferences, POINT_GROUP, POINT_LABEL } from './climbing-points';

describe('points du profil', () => {
  it('chaque point a un libellé et un groupe', () => {
    for (const p of CLIMBING_POINTS) {
      expect(POINT_LABEL[p].length).toBeGreaterThan(2);
      expect(['strength', 'endurance', 'technique', 'mobility', 'mental']).toContain(
        POINT_GROUP[p],
      );
    }
  });

  it('garde les points connus, dans l’ordre, sans doublon ni recouvrement', () => {
    expect(
      normalizePreferences(['slab', 'crimps', 'inconnu', 'crimps'], ['crimps', 'power', 'power']),
    ).toEqual({ weakPoints: ['crimps', 'slab'], likedPoints: ['power'] });
    expect(normalizePreferences(null, undefined)).toEqual({ weakPoints: [], likedPoints: [] });
  });
});
