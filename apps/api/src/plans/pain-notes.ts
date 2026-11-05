/**
 * Repère dans les notes d'une séance une douleur ou une blessure signalée.
 * Détection volontairement simple par mots-clés : mieux vaut alléger une séance pour rien
 * que d'envoyer quelqu'un forcer sur une poulie abîmée.
 */

/** Tournures négatives à ignorer : « pas mal », « plus de douleur », « sans gêne »… */
const NEGATED =
  /\b(?:pas|plus|aucune?|sans|zero)\s+(?:de\s+|d'|d’)?(?:mal|douleurs?|genes?|blessures?)\b/g;

const PAIN_KEYWORDS = [
  /\bmal\b/,
  /\bdouleurs?\b/,
  /\bdouloureu(?:x|se|ses)\b/,
  /\bbless(?:e|ee|es|ees|ure|ures)\b/,
  /\bgene(?:e|s|es)?\b/,
  /\btendinite/,
  /\bpoulies?\b/,
  /\bentorse/,
  /\binflamm/,
  /\bca tire\b/,
  /\bclaque\b/,
  /\bcontracture/,
];

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/’/g, "'");
}

export function mentionsPain(notes: string | null | undefined): boolean {
  if (!notes) return false;
  const text = normalize(notes).replace(NEGATED, ' ');
  return PAIN_KEYWORDS.some((re) => re.test(text));
}
