/** Encre utilisée sur les prises claires. */
export const INK = '#17181B';

function channel(hex: string, i: number): number {
  const x = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
  return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

function isHex(hex: string | null | undefined): hex is string {
  return !!hex && /^#[0-9a-f]{6}$/i.test(hex);
}

/** Texte lisible sur une prise : luminance relative > 0,18 → encre, sinon blanc. */
export function onHold(hex: string | null | undefined): string {
  if (!isHex(hex)) return 'var(--ink)';
  const l = 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  return l > 0.18 ? INK : '#FFFFFF';
}

/**
 * Couleur du pointillé d'une prise ratée : une prise presque blanche (ou presque noire
 * en thème sombre) disparaîtrait, on prend alors le gris du thème.
 */
export function holdLine(hex: string | null | undefined): string {
  if (!isHex(hex)) return 'var(--muted)';
  const l = 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2);
  return l > 0.8 ? 'var(--muted)' : hex;
}

/** Variables CSS consommées par .hold et .hold-chip (styles.scss). */
export function holdVars(hex: string | null | undefined): Record<string, string | null> {
  return isHex(hex)
    ? { '--hold': hex, '--on-hold': onHold(hex), '--hold-line': holdLine(hex) }
    : { '--hold': null, '--on-hold': null, '--hold-line': null };
}
