import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MobilityRoutine, MobilityStep } from '../../core/models';
import { MobilityPage } from './mobility';

const step = (id: string, seconds: number, sides = false): MobilityStep => ({
  id,
  title: id,
  dose: `${seconds} s`,
  seconds,
  sides,
  instruction: `Consigne ${id}`,
  video: `https://www.youtube.com/results?search_query=${id}`,
  info: { why: `Pourquoi ${id}`, how: ['Comment'], pitfalls: ['Piège'] },
});

export const ROUTINE: MobilityRoutine = {
  id: 'souplesse',
  title: 'Souplesse',
  minutes: 15,
  intro: 'Chez toi, sans matériel.',
  steps: [step('Chat-vache', 60), step('90/90', 120), step('Fente basse', 120, true)],
};

describe('MobilityPage', () => {
  let fixture: ComponentFixture<MobilityPage>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let page: MobilityPage;
  const tick = (ms: number) => {
    (page as unknown as { tick(now: number): void }).tick(Date.now() + ms);
    fixture.detectChanges();
  };
  const title = () => el.querySelector('[data-testid=mobility-title]')?.textContent?.trim();

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MobilityPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(MobilityPage);
    page = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  const loaded = () => {
    http.expectOne('/api/plans/mobility').flush(ROUTINE);
    fixture.detectChanges();
  };

  it('charge la routine depuis l’API et liste les exercices avec ⓘ et vidéo', () => {
    expect(el.textContent).toContain('Chargement');
    loaded();
    const items = el.querySelectorAll('[data-testid=mobility-steps] > li');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('Chat-vache');
    expect(el.querySelectorAll('[data-testid=info]').length).toBe(3);
    expect(el.querySelectorAll('[data-testid=video-link]').length).toBe(3);
  });

  it('affiche une erreur si l’API ne répond pas', () => {
    http.expectOne('/api/plans/mobility').flush('KO', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(el.querySelector('.error')).not.toBeNull();
    expect(el.querySelector('[data-testid=mobility-start]')).toBeNull();
  });

  it('le minuteur enchaîne les exercices et signale le changement de côté', () => {
    loaded();
    (el.querySelector('[data-testid=mobility-start]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(title()).toBe('Chat-vache');

    // Chat-vache (60 s) + 90/90 (120 s) écoulés : fente basse, premier côté
    tick(181_000);
    expect(title()).toBe('Fente basse');
    expect(el.querySelector('.side')?.textContent).toContain('Premier côté');

    tick(181_000 + 61_000);
    expect(el.querySelector('.side')?.textContent).toContain('Change de côté');
  });
});
