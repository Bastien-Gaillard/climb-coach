import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AiStatus } from '../core/models';
import { AiBanner } from './ai-banner';

describe('AiBanner', () => {
  let fixture: ComponentFixture<AiBanner>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const show = (status: AiStatus) => {
    fixture = TestBed.createComponent(AiBanner);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/plans/ai-status').flush(status);
    fixture.detectChanges();
  };
  const banner = () => el.querySelector('[data-testid=ai-banner]');

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [AiBanner],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
    sessionStorage.clear();
  });

  it('rien quand Mistral répond', () => {
    show({ enabled: true, state: 'ok' });
    expect(banner()).toBeNull();
  });

  it('prévient quand le quota est atteint', () => {
    show({
      enabled: true,
      state: 'quota_exceeded',
      since: new Date().toISOString(),
      message: 'HTTP 402',
    });
    expect(banner()?.classList).toContain('severe');
    expect(banner()?.textContent).toContain('Quota Mistral atteint');
    expect(banner()?.textContent).toContain('admin.mistral.ai');
  });

  it('une saturation ancienne n’est plus signalée, un quota si', () => {
    const old = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    show({ enabled: true, state: 'rate_limited', since: old });
    expect(banner()).toBeNull();
    fixture.destroy();
    show({ enabled: true, state: 'quota_exceeded', since: old });
    expect(banner()).not.toBeNull();
  });

  it('se ferme, et revient pour une nouvelle panne', () => {
    show({ enabled: true, state: 'quota_exceeded', since: '2026-11-12T17:00:00Z' });
    (el.querySelector('button[aria-label=Fermer]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(banner()).toBeNull();

    fixture.destroy();
    show({ enabled: true, state: 'quota_exceeded', since: '2026-11-13T09:00:00Z' });
    expect(banner()).not.toBeNull();
  });

  it('rien sans clé Mistral configurée', () => {
    show({ enabled: false, state: 'quota_exceeded' });
    expect(banner()).toBeNull();
  });
});
