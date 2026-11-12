import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { SessionWithClimbs } from '../sessions/sessions.service';
import { FOCUS_LABEL } from './history-analysis';
import { ChatMessage, extractJson, MistralError, MistralGenerator } from './mistral.generator';
import { FocusSchema } from './plan.schema';
import { diffDays, localDay, NextSessionOverride, Schedule } from './schedule';

/** Ce que Mistral doit renvoyer : la prochaine séance seulement, la suite vient des règles. */
export const NextSessionSchema = z.object({
  inDays: z.number().int().min(0).max(28),
  focus: FocusSchema,
  intensity: z.enum(['light', 'normal']),
  durationMinutes: z.number().int().min(30).max(240),
  reason: z.string().trim().min(1).max(300),
});

const SCHEDULE_PROMPT = `Tu es un coach d'escalade diplômé qui suit un grimpeur de bloc amateur régulier.
Ton rôle : décider QUAND aura lieu sa prochaine séance, de quel type, combien de temps et à quelle intensité.

Ce que tu reçois :
- la date du jour et le rythme visé (séances par semaine) ;
- une proposition calculée par des règles fixes (rotation force → endurance → technique, jours de récup) ;
- ses dernières séances : date, type, durée, fatigue ressentie (1 = frais, 5 = épuisé), blocs tentés et ses NOTES libres.

Ta valeur ajoutée : lire et interpréter les notes et l'historique, ce que les règles ne savent pas faire.
- Pas de souci particulier dans les notes : garde la proposition des règles (tu peux l'ajuster d'un jour si l'historique le justifie).
- Petite gêne, courbatures, fatigue inhabituelle : un ou deux jours de plus, séance "light", plutôt technique, jamais de force.
- Douleur nette ou qui revient (doigts, poulie, épaule, coude, poignet, genou…) : plusieurs jours de repos (3 à 6), puis reprise "light" en technique, sans solliciter la zone.
- Blessure sérieuse (entorse, poulie qui a claqué, déchirure, choc, "grosse blessure", "très mal", avis médical) : au moins 7 jours, souvent 10 à 21, reprise "light" en technique ; conseille de consulter un médecin ou un kiné avant de reprendre.
- Notes positives (en forme, frais, bien récupéré) : tu peux rapprocher la séance d'un jour, sans descendre sous un jour complet de repos après une séance de force.
- Respecte au mieux le rythme visé quand rien ne s'y oppose. La santé passe toujours avant le rythme.
- Durée en minutes, par pas de 15 : force 45 à 75, endurance 60 à 105, technique 60 à 120 ; plus court si "light".

Le champ "reason" s'adresse directement au grimpeur (tutoiement), en 1 ou 2 phrases courtes, et cite ce qui a motivé ta décision (ex : la note qui parle de l'épaule).

Réponds UNIQUEMENT avec un objet JSON :
{
  "inDays": entier, nombre de jours à partir d'aujourd'hui (0 = aujourd'hui, 1 = demain), entre 0 et 28,
  "focus": "strength" | "endurance" | "technique",
  "intensity": "light" | "normal",
  "durationMinutes": entier,
  "reason": "explication"
}
Pas de texte autour, pas de balises Markdown.`;

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function dayLabel(day: string): string {
  return WEEKDAY.format(new Date(`${day}T12:00:00Z`));
}

/** Contexte envoyé à Mistral : la proposition des règles et l'historique avec les notes. */
export function buildScheduleUserPrompt(history: SessionWithClimbs[], base: Schedule): string {
  const first = base.sessions[0];
  const lines = history.slice(0, 5).map((s) => {
    const day = localDay(s.date);
    const ago = diffDays(day, base.today);
    const climbs = s.climbs.map((c) => `${c.grade}${c.sent ? '' : ' (échec)'}`).join(', ');
    return `- ${dayLabel(day)} (il y a ${ago} j) : ${FOCUS_LABEL[s.focus]}, ${s.durationMinutes} min, fatigue ${s.fatigue}/5${climbs ? `, blocs : ${climbs}` : ''}, notes : ${s.notes?.trim() ? `« ${s.notes.trim()} »` : 'aucune'}`;
  });

  return [
    `Aujourd'hui : ${dayLabel(base.today)}.`,
    `Rythme visé : ${base.sessionsPerWeek} séance${base.sessionsPerWeek > 1 ? 's' : ''} par semaine.`,
    first
      ? `Proposition des règles : ${FOCUS_LABEL[first.focus]} ${first.intensity === 'light' ? 'légère ' : ''}de ${first.durationMinutes} min dans ${first.inDays} j (${dayLabel(first.date)}). Raison : ${first.reason}.`
      : 'Pas de proposition des règles.',
    `Dernières séances, de la plus récente à la plus ancienne :\n${lines.join('\n')}`,
  ].join('\n');
}

/** Valide la réponse de Mistral (JSON + schéma), durée arrondie au quart d'heure. */
export function parseNextSession(content: string): NextSessionOverride {
  let json: unknown;
  try {
    json = JSON.parse(extractJson(content));
  } catch {
    throw new MistralError('Réponse non JSON');
  }
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const k of ['inDays', 'durationMinutes']) {
      if (typeof o[k] === 'string' && o[k] !== '') o[k] = Number(o[k]);
      if (typeof o[k] === 'number') o[k] = Math.round(o[k]);
    }
  }
  const result = NextSessionSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new MistralError(`Réponse hors schéma (${first.path.join('.')}: ${first.message})`);
  }
  const advice = result.data;
  return { ...advice, durationMinutes: Math.round(advice.durationMinutes / 15) * 15 || 30 };
}

/** Demande à Mistral la prochaine séance, en interprétant les notes. */
@Injectable()
export class MistralScheduleAdvisor {
  constructor(private readonly mistral: MistralGenerator) {}

  get enabled(): boolean {
    return this.mistral.enabled;
  }

  async adviseNext(history: SessionWithClimbs[], base: Schedule): Promise<NextSessionOverride> {
    const messages: ChatMessage[] = [
      { role: 'system', content: SCHEDULE_PROMPT },
      { role: 'user', content: buildScheduleUserPrompt(history, base) },
    ];
    const content = await this.mistral.chat(messages, 'low');
    let advice: NextSessionOverride;
    try {
      advice = parseNextSession(content);
    } catch (e) {
      if (!(e instanceof MistralError)) throw e;
      const retry = await this.mistral.chat(
        [
          ...messages,
          { role: 'assistant', content },
          {
            role: 'user',
            content: `Ta réponse est invalide : ${e.message}. Renvoie uniquement le JSON corrigé.`,
          },
        ],
        'low',
      );
      advice = parseNextSession(retry);
    }

    // Jamais deux séances le même jour : si la dernière a eu lieu aujourd'hui, pas avant demain
    const last = history[0];
    if (last && advice.inDays === 0 && localDay(last.date) === base.today) advice.inDays = 1;
    return advice;
  }
}
