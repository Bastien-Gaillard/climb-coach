import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GeneratedPlan } from '../../core/models';
import { PlanStore } from '../../core/plan.store';
import { LivePage } from './live';

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
      { kind: 'warmup', title: 'Échauffement', minutes: 15, instructions: ['Mobilité'] },
      { kind: 'main', title: 'Technique', minutes: 40, instructions: ['Pieds silencieux'] },
      { kind: 'cooldown', title: 'Retour au calme', minutes: 5, instructions: ['Étirements'] },
    ],
  },
};

describe('LivePage · minuteur', () => {
  let fixture: ComponentFixture<LivePage>;
  let el: HTMLElement;
  const t0 = new Date('2026-11-12T18:00:00Z');

  const clock = () => el.querySelector('.clock')?.textContent?.trim();
  const title = () => el.querySelector('h1')?.textContent?.trim();

  beforeEach(() => {
    sessionStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(t0);
    TestBed.configureTestingModule({
      imports: [LivePage],
      providers: [provideRouter([])],
    });
    TestBed.inject(PlanStore).set(plan);
    fixture = TestBed.createComponent(LivePage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
    sessionStorage.clear();
  });

  it('décompte le temps réel', () => {
    expect(clock()).toBe('15:00');
    jasmine.clock().tick(61_000);
    fixture.detectChanges();
    expect(clock()).toBe('13:59');
  });

  it('rattrape le temps passé en veille, même sur plusieurs blocs', () => {
    // Téléphone en veille : aucun tick pendant 20 min, puis la page revient
    jasmine.clock().mockDate(new Date(t0.getTime() + 20 * 60_000));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();

    // 15 min d'échauffement écoulées + 5 min de technique : il reste 35 min
    expect(title()).toBe('Technique');
    expect(clock()).toBe('35:00');
  });

  it('une pause fige le temps restant, même pendant une veille', () => {
    jasmine.clock().tick(60_000);
    (el.querySelector('.controls .primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    jasmine.clock().mockDate(new Date(t0.getTime() + 30 * 60_000));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(clock()).toBe('14:00');
  });

  it('reprend au même endroit après un rechargement de la page', () => {
    jasmine.clock().tick(5 * 60_000);
    fixture.detectChanges();
    fixture.destroy();

    // Nouvelle instance (onglet rechargé) 2 min plus tard
    jasmine.clock().mockDate(new Date(t0.getTime() + 7 * 60_000));
    fixture = TestBed.createComponent(LivePage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    expect(clock()).toBe('08:00');
  });
});
