import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConverterPage } from './converter';

describe('ConverterPage', () => {
  let fixture: ComponentFixture<ConverterPage>;
  let el: HTMLElement;

  const select = (label: string, value: string) => {
    const s = Array.from(el.querySelectorAll('label'))
      .find((l) => l.textContent?.trim().startsWith(label))!
      .querySelector('select')!;
    s.value = value;
    s.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ConverterPage] });
    fixture = TestBed.createComponent(ConverterPage);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  it('convertit la cotation par défaut (6B Font -> V4)', () => {
    expect(el.querySelector('[data-testid=grade-result]')?.textContent?.trim()).toBe('V4');
  });

  it('suit les changements de cotation', () => {
    select('Cotation', '7A');
    expect(el.querySelector('[data-testid=grade-result]')?.textContent?.trim()).toBe('V6');
  });

  it('ne propose que des systèmes de la même discipline', () => {
    select('Système', 'french');
    const targets = Array.from(
      Array.from(el.querySelectorAll('label'))
        .find((l) => l.textContent?.trim().startsWith('Vers'))!
        .querySelectorAll('option'),
    ).map((o) => o.value);
    expect(targets).toEqual(['yds']);
  });

  it('affiche les couleurs équivalentes avec leur recouvrement', () => {
    const items = Array.from(el.querySelectorAll('[data-testid=color-matches] li')).map((li) =>
      li.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(items[0]).toContain('bleu');
    expect(items[0]).toContain('67 %');
    expect(items[1]).toContain('vert');
  });
});
