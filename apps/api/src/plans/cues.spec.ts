import { CUE_SESSIONS, CUES, currentCue, nextCue, orderedCues } from './cues';

describe('consigne du jour', () => {
  it('8 consignes, ids uniques, chacune avec son ⓘ et sa vidéo', () => {
    expect(CUES).toHaveLength(8);
    expect(new Set(CUES.map((c) => c.id)).size).toBe(8);
    for (const c of CUES) {
      expect(c.info.how.length).toBeGreaterThan(0);
      expect(c.video).toMatch(/^https:\/\/www\.youtube\.com\//);
    }
  });

  it('celles des points faibles passent en premier', () => {
    const list = orderedCues(['hips']);
    expect(list[0].id).toBe('straight-arms');
    expect(list[1].id).toBe('hips-wall');
    expect(list).toHaveLength(8);
  });

  it('sans consigne : la première, enregistrée', () => {
    expect(currentCue({ cue: null, since: 0 }, 4, ['footwork'])).toEqual({
      cue: CUES[0],
      since: 4,
      changed: true,
    });
  });

  it('la même pendant 10 séances, puis la suivante', () => {
    const state = { cue: 'slow', since: 3 };
    expect(currentCue(state, 3 + CUE_SESSIONS - 1)).toMatchObject({
      cue: { id: 'slow' },
      changed: false,
    });
    expect(currentCue(state, 3 + CUE_SESSIONS)).toMatchObject({
      cue: { id: 'downclimb' },
      since: 13,
      changed: true,
    });
  });

  it('une consigne inconnue (retirée) est remplacée', () => {
    expect(currentCue({ cue: 'ancienne', since: 0 }, 1).changed).toBe(true);
  });

  it('« Changer » passe à la suivante et reboucle', () => {
    expect(nextCue('silent-feet').id).toBe('slow');
    expect(nextCue(CUES[CUES.length - 1].id).id).toBe(CUES[0].id);
    expect(nextCue(null).id).toBe(CUES[0].id);
  });
});
