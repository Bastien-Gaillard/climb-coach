import { STALE_AFTER_MS, takeDue, upcoming } from './alerts';

const alert = (at: number, title = `bloc ${at}`) => ({ at, title, body: '' });

describe('alertes de fin de bloc', () => {
  it('envoie l’alerte due et garde les suivantes', () => {
    const { send, rest } = takeDue([alert(3000), alert(1000), alert(2000)], 1500);
    expect(send?.at).toBe(1000);
    expect(rest.map((a) => a.at)).toEqual([2000, 3000]);
  });

  it('n’envoie que la plus récente quand plusieurs sont dues d’un coup', () => {
    const { send, rest } = takeDue([alert(1000), alert(2000)], 2500);
    expect(send?.at).toBe(2000);
    expect(rest).toEqual([]);
  });

  it('jette une alerte périmée sans l’envoyer', () => {
    const { send, rest } = takeDue([alert(1000)], 1000 + STALE_AFTER_MS + 1);
    expect(send).toBeNull();
    expect(rest).toEqual([]);
  });

  it('ne garde que les alertes à venir, triées', () => {
    expect(upcoming([alert(5000), alert(500), alert(2000)], 1000).map((a) => a.at)).toEqual([
      2000, 5000,
    ]);
  });
});
