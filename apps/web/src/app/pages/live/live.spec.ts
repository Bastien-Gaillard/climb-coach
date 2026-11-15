import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GeneratedPlan } from '../../core/models';
import { PlanStore } from '../../core/plan.store';
import { PushAlerts, VIBRATION } from '../../core/push-alerts';
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

  let vibrate: jasmine.Spy;

  beforeEach(() => {
    sessionStorage.clear();
    jasmine.clock().install();
    jasmine.clock().mockDate(t0);
    TestBed.configureTestingModule({
      imports: [LivePage],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    // Pas de service worker ni d'appel à l'API ici : PushAlerts est testé à part
    spyOn(TestBed.inject(PushAlerts), 'init').and.resolveTo();
    vibrate = spyOn(navigator, 'vibrate').and.returnValue(true);
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

  it('affiche le volume de chaque cotation avec ses couleurs', () => {
    fixture.destroy();
    const withVolumes = structuredClone(plan);
    withVolumes.plan.blocks[0].target = {
      style: 'boulder',
      grade: '5+',
      volumes: [
        {
          count: '3 blocs',
          grade: '5+',
          colors: [
            { color: 'orange', hex: '#f97316' },
            { color: 'bleu', hex: '#3b82f6' },
          ],
        },
        { count: '2 blocs', grade: '6A', colors: [{ color: 'rouge', hex: '#ef4444' }] },
      ],
    };
    TestBed.inject(PlanStore).set(withVolumes);
    fixture = TestBed.createComponent(LivePage);
    el = fixture.nativeElement;
    fixture.detectChanges();

    const rows = Array.from(el.querySelectorAll('[data-testid=target-volume]'));
    expect(rows.map((r) => r.querySelectorAll('.hold-chip').length)).toEqual([2, 1]);
    expect(rows[0].textContent).toContain('3 blocs');
    expect(rows[1].textContent).toContain('rouge');
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

  it('vibre à la fin d’un bloc, une seule fois', () => {
    jasmine.clock().tick(15 * 60_000);
    fixture.detectChanges();
    expect(title()).toBe('Technique');
    expect(vibrate).toHaveBeenCalledOnceWith(VIBRATION);
    jasmine.clock().tick(5_000);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });

  it('vibre à chaque fin de bloc, jusqu’à la fin de séance, puis s’arrête', () => {
    jasmine.clock().tick(60 * 60_000);
    // Échauffement, Technique, Retour au calme
    expect(vibrate).toHaveBeenCalledTimes(3);
    jasmine.clock().tick(30_000);
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it('ne vibre pas au retour de veille pour une fin de bloc déjà ancienne', () => {
    jasmine.clock().mockDate(new Date(t0.getTime() + 20 * 60_000));
    document.dispatchEvent(new Event('visibilitychange'));
    fixture.detectChanges();
    expect(title()).toBe('Technique');
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('propose d’activer les notifications tant qu’elles ne le sont pas', () => {
    const push = TestBed.inject(PushAlerts);
    const enable = spyOn(push, 'enable').and.resolveTo();
    push.state.set('ask');
    fixture.detectChanges();
    (el.querySelector('[data-testid=push-enable]') as HTMLButtonElement).click();
    expect(enable).toHaveBeenCalled();

    push.state.set('on');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid=push-enable]')).toBeNull();
  });
});
