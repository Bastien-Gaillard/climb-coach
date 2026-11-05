import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { GymColor } from '../core/models';
import { ColorPicker, formatRange, textOn } from './color-picker';

@Component({
  imports: [ColorPicker, ReactiveFormsModule],
  template: `<app-color-picker [formControl]="control" [colors]="colors" />`,
})
class Host {
  control = new FormControl('vert', { nonNullable: true });
  colors: GymColor[] = [
    { color: 'jaune', hex: '#facc15', min: '4', max: '5' },
    { color: 'vert', hex: '#22c55e', min: '5+', max: '5+' },
    { color: 'noir', hex: '#111827', min: '6C', max: '7A' },
  ];
}

describe('ColorPicker', () => {
  const setup = () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    );
    return { fixture, buttons };
  };

  it('affiche une pastille par couleur avec sa plage', () => {
    const { buttons } = setup();
    const text = (b: HTMLElement) =>
      `${b.querySelector('.name')?.textContent?.trim()} ${b.querySelector('.range')?.textContent?.trim()}`;
    expect(buttons.map(text)).toEqual(['jaune 4 – 5', 'vert 5+', 'noir 6C – 7A']);
    const dot = buttons[0].querySelector<HTMLElement>('.hold')!;
    expect(dot.style.getPropertyValue('--hold')).toBe('#facc15');
    expect(dot.style.getPropertyValue('--on-hold')).toBe('#17181B');
  });

  it('reflète la valeur du formulaire et la met à jour au clic', () => {
    const { fixture, buttons } = setup();
    expect(buttons[1].getAttribute('aria-checked')).toBe('true');

    buttons[2].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.control.value).toBe('noir');
    expect(buttons[2].classList).toContain('selected');
    expect(buttons[1].classList).not.toContain('selected');
  });

  it('se désactive avec le formulaire', () => {
    const { fixture, buttons } = setup();
    fixture.componentInstance.control.disable();
    fixture.detectChanges();
    expect(buttons.every((b) => b.disabled)).toBeTrue();
  });
});

describe('helpers', () => {
  it('formatRange raccourcit une plage d’une seule cotation', () => {
    expect(formatRange({ min: '5', max: '5' })).toBe('5');
    expect(formatRange({ min: '6A', max: '6B+' })).toBe('6A – 6B+');
  });

  it('textOn choisit un texte lisible', () => {
    expect(textOn('#111827')).toBe('#FFFFFF');
    expect(textOn('#facc15')).toBe('#17181B');
    expect(textOn('#2f6fd6')).toBe('#FFFFFF');
    expect(textOn('#2e9e5b')).toBe('#17181B');
  });
});
