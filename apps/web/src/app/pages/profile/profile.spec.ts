import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Profile } from '../../core/models';
import { ProfilePage } from './profile';

const profile: Profile = {
  id: 'u1',
  username: 'kuzimu',
  sessionsPerWeek: 3,
  equipment: ['elastic'],
};

describe('ProfilePage', () => {
  let fixture: ComponentFixture<ProfilePage>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const box = (id: string) => el.querySelector<HTMLButtonElement>(`[data-testid=equipment-${id}]`)!;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ProfilePage);
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne('/api/auth/me').flush(profile);
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('affiche le matériel en cases à cocher, l’élastique coché', () => {
    expect(box('elastic').getAttribute('role')).toBe('checkbox');
    expect(box('elastic').getAttribute('aria-checked')).toBe('true');
    expect(box('hangboard').getAttribute('aria-checked')).toBe('false');
    expect(el.querySelectorAll('[role=checkbox]').length).toBe(4);
  });

  it('enregistre tout de suite le matériel coché', () => {
    box('hangboard').click();
    fixture.detectChanges();
    expect(box('hangboard').getAttribute('aria-checked')).toBe('true');
    const req = http.expectOne('/api/auth/me');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ equipment: ['elastic', 'hangboard'] });
    req.flush({ ...profile, equipment: ['elastic', 'hangboard'] });
  });

  it('décoche, et revient en arrière si l’enregistrement échoue', () => {
    box('elastic').click();
    fixture.detectChanges();
    expect(box('elastic').getAttribute('aria-checked')).toBe('false');
    http
      .expectOne('/api/auth/me')
      .flush({ message: 'Erreur' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(box('elastic').getAttribute('aria-checked')).toBe('true');
    expect(el.querySelector('.error')).not.toBeNull();
  });
});
