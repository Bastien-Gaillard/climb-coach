import { ClimbingPoint } from '../auth/climbing-points';
import { PlanInfo } from './plan.schema';

/**
 * Consignes du jour : une seule compétence, travaillée à l'échauffement et sur les blocs faciles,
 * gardée 10 séances de suite pour qu'elle devienne un automatisme (ClimbStrong : une compétence,
 * 10 min par séance, 10 séances). Puis la suivante, d'après les points faibles.
 */
export interface Cue {
  id: string;
  text: string;
  /** Points faibles qu'elle travaille : ces consignes passent en premier. */
  points: ClimbingPoint[];
  video: string;
  info: PlanInfo;
}

/** Nombre de séances pendant lesquelles une consigne reste la même. */
export const CUE_SESSIONS = 10;

export const CUES: Cue[] = [
  {
    id: 'silent-feet',
    text: 'Pieds silencieux',
    points: ['footwork'],
    video: 'https://www.youtube.com/watch?v=WbscmZDybdQ',
    info: {
      why: 'Un pied posé sans bruit est un pied posé avec précision, du premier coup.',
      how: [
        'Regarde la prise de pied jusqu’à ce que le chausson la touche',
        'Pose-le doucement, puis seulement lève les yeux',
        'Un bruit : redescends d’un mouvement et refais-le',
      ],
      pitfalls: ['Ralentir les mains au lieu de soigner les pieds'],
    },
  },
  {
    id: 'slow',
    text: 'Au ralenti : 3 temps par mouvement',
    points: ['balance', 'tension'],
    video: 'https://www.youtube.com/watch?v=AGjQ_U-5iuk',
    info: {
      why: 'Grimper lentement oblige à rester en équilibre, sans compter sur l’élan.',
      how: [
        'Compte 3 temps pour chaque mouvement de main',
        'Si tu ne peux pas aller lentement, ton corps est mal placé : change de position',
      ],
      pitfalls: ['Bloquer la respiration'],
    },
  },
  {
    id: 'downclimb',
    text: 'Désescalade au lieu de sauter',
    points: ['footwork', 'fall'],
    video: 'https://www.youtube.com/watch?v=MHb7WYn0S0E',
    info: {
      why: 'Redescendre en grimpant double le travail des pieds et ménage les genoux.',
      how: [
        'Redescends par le bloc, ou par les prises les plus faciles autour',
        'Regarde tes pieds à la descente',
      ],
      pitfalls: ['Désescalader un bloc trop dur pour toi : saute plutôt qu’à bout de bras'],
    },
  },
  {
    id: 'straight-arms',
    text: 'Bras tendus dès que possible',
    points: ['resistance', 'recovery', 'hips'],
    video: 'https://www.youtube.com/watch?v=xyc_VvqxPps',
    info: {
      why: 'Bras tendu, c’est le squelette qui porte : les avant-bras gonflent beaucoup moins.',
      how: [
        'Entre deux mouvements, laisse pendre le corps sous la prise, bras tendu',
        'Ce sont les jambes et les hanches qui font monter',
      ],
      pitfalls: ['Rester bras pliés pour « être prêt » : c’est ce qui fatigue'],
    },
  },
  {
    id: 'one-touch',
    text: 'Une seule prise de main : pas de réajustement',
    points: ['reading', 'crimps', 'slopers', 'pinches', 'compression'],
    video: 'https://www.youtube.com/shorts/hOmK8SKBPiE',
    info: {
      why: 'Prendre la prise du premier coup à la bonne place, c’est de l’énergie économisée.',
      how: [
        'Regarde la prise avant d’y aller : où mettre les doigts ?',
        'Une fois la main posée, elle ne bouge plus',
      ],
      pitfalls: ['Aller trop vite et prendre la prise au hasard'],
    },
  },
  {
    id: 'look-feet',
    text: 'Regarder chaque pied jusqu’à le poser',
    points: ['footwork', 'slab'],
    video: 'https://www.youtube.com/watch?v=jQMpu64Rq6E',
    info: {
      why: 'On rate surtout les pieds qu’on ne regarde plus au dernier moment.',
      how: [
        'Les yeux restent sur la prise de pied jusqu’au contact',
        'Seulement ensuite, regarde la prochaine main',
      ],
      pitfalls: ['Regarder déjà la main suivante pendant que le pied se pose'],
    },
  },
  {
    id: 'read-flow',
    text: 'Lire tout le bloc, puis enchaîner sans s’arrêter',
    points: ['reading', 'commitment', 'coordination'],
    video: 'https://www.youtube.com/shorts/bB3dgoOBp1E',
    info: {
      why: 'Une méthode prévue au sol permet de grimper d’un trait, sans hésiter.',
      how: [
        'Au sol, mime les mouvements : mains, pieds, où ça se corse',
        'Puis grimpe sans t’arrêter pour réfléchir',
      ],
      pitfalls: ['Lire seulement les mains, pas les pieds'],
    },
  },
  {
    id: 'hips-wall',
    text: 'Hanches près du mur dans les dévers',
    points: ['hips', 'tension', 'wall-styles', 'hooks'],
    video: 'https://www.youtube.com/shorts/tpu9AOBjIy4',
    info: {
      why: 'Hanche collée au mur, le poids passe sur les pieds et les bras se reposent.',
      how: [
        'Tourne la hanche vers le mur, sur la carre externe du pied',
        'Allonge le bras quand la hanche est au mur, pas avant',
      ],
      pitfalls: ['Rester de face au mur dans le dévers'],
    },
  },
];

/** Consignes dans l'ordre de passage : celles des points faibles d'abord. */
export function orderedCues(weakPoints: readonly ClimbingPoint[] = []): Cue[] {
  const weak = new Set(weakPoints);
  const isWeak = (c: Cue) => c.points.some((p) => weak.has(p));
  return [...CUES.filter(isWeak), ...CUES.filter((c) => !isWeak(c))];
}

/** La consigne qui suit `current` dans l'ordre de passage (la première sans consigne connue). */
export function nextCue(current: string | null, weakPoints: readonly ClimbingPoint[] = []): Cue {
  const list = orderedCues(weakPoints);
  const at = list.findIndex((c) => c.id === current);
  return list[(at + 1) % list.length];
}

/** Consigne enregistrée pour un compte, et le nombre de séances qu'il avait à ce moment-là. */
export interface CueState {
  cue: string | null;
  since: number;
}

/**
 * Consigne du jour : la même tant qu'elle n'a pas servi {@link CUE_SESSIONS} séances, puis la
 * suivante. `changed` dit s'il faut enregistrer le nouvel état.
 */
export function currentCue(
  state: CueState,
  sessionCount: number,
  weakPoints: readonly ClimbingPoint[] = [],
): { cue: Cue; since: number; changed: boolean } {
  const known = CUES.find((c) => c.id === state.cue);
  if (known && sessionCount - state.since < CUE_SESSIONS) {
    return { cue: known, since: state.since, changed: false };
  }
  return { cue: nextCue(known ? known.id : null, weakPoints), since: sessionCount, changed: true };
}
