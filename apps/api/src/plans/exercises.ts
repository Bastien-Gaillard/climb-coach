import { ClimbingPoint, POINT_LABEL } from '../auth/climbing-points';
import { Focus } from './plan.schema';

/**
 * Catalogue des exercices de bloc, par type de séance. Il sert au générateur par règles (qui
 * y pioche en variant d'une séance à l'autre) et à Mistral (qui le reçoit dans son prompt).
 *
 * Sources principales : protocoles du 4×4 et des circuits de résistance (Gripped, ClimbStrong),
 * exercices de mouvement de Kris Hampton (TrainingBeta), exercices de placement de pieds
 * (99Boulders, Climbing), protocole du bloc au max (TrainingBeta). Points faibles (types de prise,
 * compression, tension, coordination, style de mur, chute) : Lattice, Neil Gresham, Climbing
 * Canada, Gripped, ClimbStrong, Brooklyn Boulders, Strong Mind Climbing.
 */

/** De quoi rédiger un exercice : niveau du grimpeur et temps alloué. */
export interface ExerciseContext {
  /** Meilleure réussite récente (valeur sur l'échelle Fontainebleau). */
  maxSent: number;
  /** Niveau à viser en force (maxSent, ou un cran au-dessus). */
  project: number;
  /** 1 pour une séance légère, 0 sinon : on baisse les cotations d'un cran. */
  light: number;
  /** Minutes accordées à l'exercice. */
  minutes: number;
  /** Cotation affichée pour une valeur (avec la couleur de la salle si elle est connue). */
  grade: (value: number) => string;
}

export interface ExerciseBlock {
  title: string;
  /** Valeur de la cotation la plus dure demandée. */
  target: number;
  instructions: string[];
}

export interface Exercise {
  id: string;
  focus: Focus;
  /** Points faibles qu'il travaille (ou plaisirs qu'il offre), pour le profil du grimpeur. */
  points: ClimbingPoint[];
  name: string;
  /** Une phrase : le but et le principe, pour Mistral et pour s'y retrouver. */
  summary: string;
  /** Temps minimal pour que l'exercice ait du sens. */
  minMinutes: number;
  /** Page qui décrit l'exercice ou son protocole. */
  source?: string;
  /** Réservé aux grimpeurs confirmés (6C et plus) : charge forte sur les doigts et les épaules. */
  advanced?: boolean;
  /** À éviter quand une douleur est signalée (sollicite fort doigts, épaules ou coudes). */
  stressful?: boolean;
  build: (c: ExerciseContext) => ExerciseBlock;
}

/** 6C : en dessous, on évite le travail sans les pieds et à un bras. */
export const ADVANCED_LEVEL = 8;

const count = (minutes: number, perItem: number, min: number, max = 12) =>
  Math.min(max, Math.max(min, Math.floor(minutes / perItem)));

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

export const EXERCISES: Exercise[] = [
  // ---------- Technique : blocs sous le niveau max, une consigne de mouvement précise
  {
    id: 'silent-feet',
    source: 'https://www.99boulders.com/?p=170',
    focus: 'technique',
    points: ['footwork'],
    name: 'Pieds silencieux',
    summary: 'Poser chaque pied sans aucun bruit, en le regardant jusqu’au contact : précision.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Pieds silencieux',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Pose chaque pied sans aucun bruit, en le regardant jusqu’à ce que le chausson touche la prise',
          'Un pied fait du bruit : redescends et refais le mouvement',
        ],
      };
    },
  },
  {
    id: 'hover-feet',
    source:
      'https://www.climbstrong.com/resource-posts/fundamental-skills-precision-execution-and-balance',
    focus: 'technique',
    points: ['footwork', 'balance'],
    name: 'Pieds en survol',
    summary: 'Garder chaque pied 3 s au-dessus de la prise avant de le poser, sans réajuster.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Pieds en survol',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Avant de poser un pied, garde-le 3 s immobile juste au-dessus de la prise, puis pose-le une seule fois, sans le réajuster',
        ],
      };
    },
  },
  {
    id: 'hover-hands',
    source: 'https://www.trainingbeta.com/?p=23718',
    focus: 'technique',
    points: ['tension', 'balance'],
    name: 'Mains en survol',
    summary:
      'Garder chaque main 2 à 3 s au-dessus de la prise avant de la prendre : gainage et placement.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Mains en survol',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}`,
          'Avant de prendre chaque prise, garde la main 2 à 3 s au-dessus, corps gainé et hanches au mur, puis attrape-la sans la réajuster',
        ],
      };
    },
  },
  {
    id: 'one-touch',
    source: 'https://www.trainingbeta.com/?p=23718',
    focus: 'technique',
    points: ['footwork', 'reading'],
    name: 'Une seule touche',
    summary: 'Chaque main et chaque pied se posent une seule fois : interdit de réajuster.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Une seule touche',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')}, du plus facile au plus dur, jusqu’en ${c.grade(v)}`,
          'Chaque main et chaque pied se posent une seule fois sur la prise : interdit de les réajuster',
        ],
      };
    },
  },
  {
    id: 'no-hands',
    source: 'https://www.mountainproject.com/forum/message/114032041',
    focus: 'technique',
    points: ['slab', 'balance'],
    name: 'Équilibre sans les mains',
    summary:
      'Monter une dalle facile sans les mains : confiance dans les pieds et placement du bassin.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      const n = count(c.minutes, 2, 4, 8);
      return {
        title: 'Équilibre sans les mains',
        target: v,
        instructions: [
          `Sur une dalle facile, en ${c.grade(v)} ou moins : monte puis redescends sans utiliser les mains (mains dans le dos)`,
          'Seuls les pieds et le bassin au-dessus des pieds te portent : petits pas, regard sur chaque prise',
          `${plural(n, 'passage')}, repos 1 min entre chaque passage`,
        ],
      };
    },
  },
  {
    id: 'one-arm-slab',
    source:
      'https://assets01.sdd1.ch/assets/lbwp-cdn/mobilesport/files/1677975093/mobilesport-escalade-a-lecole--bloc-technique-manchot.pdf',
    focus: 'technique',
    points: ['balance', 'hips'],
    name: 'Un bras en moins',
    summary:
      'Grimper un bloc facile avec une seule main : équilibre, pieds et rotations du bassin.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      const n = count(c.minutes, 2, 4, 8);
      return {
        title: 'Un bras en moins',
        target: v,
        instructions: [
          `Sur une dalle ou un mur vertical facile, en ${c.grade(v)} ou moins : grimpe avec une seule main, l’autre dans le dos`,
          'Ce sont les pieds et les rotations du bassin qui te font monter, la main ne sert qu’à l’équilibre',
          `${plural(n, 'passage')} en alternant main droite et main gauche, repos 1 min entre chaque passage`,
        ],
      };
    },
  },
  {
    id: 'flag',
    source: 'https://sendedition.com/22-climbing-techniques-and-how-to-do-them',
    focus: 'technique',
    points: ['balance', 'hips'],
    name: 'Drapeaux',
    summary:
      'Un mouvement sur deux, un seul pied sur une prise et l’autre jambe tendue en contrepoids.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Drapeaux',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}`,
          'Un mouvement sur deux, garde un seul pied sur une prise et tends l’autre jambe sur le côté pour t’équilibrer (drapeau), au lieu de la poser',
        ],
      };
    },
  },
  {
    id: 'straight-arms',
    source: 'https://www.mountainproject.com/v/108661904',
    focus: 'technique',
    points: ['hips', 'resistance'],
    name: 'Bras tendus',
    summary: 'Rester bras tendus, monter avec les jambes et la rotation des hanches.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Bras tendus',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Garde les bras tendus le plus longtemps possible : ce sont les jambes et la rotation des hanches qui te font monter',
          'Plie les bras seulement au moment d’attraper la prise suivante',
        ],
      };
    },
  },
  {
    id: 'downclimb',
    source: 'https://www.99boulders.com/?p=170',
    focus: 'technique',
    points: ['footwork', 'fall'],
    name: 'Désescalade',
    summary: 'Redescendre chaque bloc par le même chemin : lecture et placement des pieds.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Désescalade',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)} : monte, puis redescends par le même chemin au lieu de sauter`,
          'En descendant, regarde chaque prise de pied avant de la charger',
        ],
      };
    },
  },
  {
    id: 'sloth-monkey',
    source: 'https://www.trainingbeta.com/?p=23718',
    focus: 'technique',
    points: ['coordination'],
    name: 'Paresseux / singe',
    summary: 'Grimper un même bloc très lentement, puis vite et fluide : maîtriser le rythme.',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      const n = count(c.minutes, 6, 2, 6);
      return {
        title: 'Paresseux / singe',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}, 2 passages par bloc`,
          'Premier passage très lent et contrôlé (paresseux), second passage rapide et fluide, sans t’arrêter (singe)',
          'Repos 2 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'dead-stops',
    source: 'https://www.trainingbeta.com/?p=23718',
    focus: 'technique',
    points: ['coordination', 'lock-off'],
    name: 'Arrêts nets',
    summary: 'Freiner l’élan juste avant chaque prise pour la prendre sans à-coup : gainage.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 1 - c.light;
      return {
        title: 'Arrêts nets',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}`,
          'Juste avant d’attraper chaque prise, freine le mouvement avec le gainage pour la prendre en douceur, sans à-coup',
        ],
      };
    },
  },
  {
    id: 'backstep',
    source: 'https://www.climbing.com/skills/how-to-improve-footwork-climbing/',
    focus: 'technique',
    points: ['hips'],
    name: 'Carre externe et hanche au mur',
    summary: 'Pied sur la carre externe et hanche collée au mur sur les grands mouvements.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Carre externe et hanche au mur',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}, sur du vertical ou du léger dévers`,
          'À chaque grand mouvement, pose le pied sur sa carre externe et tourne la hanche contre le mur pour allonger ton bras',
        ],
      };
    },
  },
  {
    id: 'heavy-feet',
    source: 'https://www.trainingbeta.com/?p=23718',
    focus: 'technique',
    points: ['footwork', 'tension'],
    name: 'Pieds lourds',
    summary:
      'Laisser le poids descendre dans les pieds et monter par les jambes : économiser les bras.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Pieds lourds',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Imagine que tout ton poids tombe dans tes pieds : bassin bas, ce sont les jambes qui poussent, les bras ne font que tenir',
        ],
      };
    },
  },

  {
    id: 'toes',
    focus: 'technique',
    points: ['footwork'],
    name: 'Sur la pointe des pieds',
    summary: 'Poser uniquement la pointe du chausson, talon haut, pour pouvoir pivoter.',
    source: 'https://sendedition.com/22-climbing-techniques-and-how-to-do-them',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Sur la pointe des pieds',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Pose seulement la pointe du chausson sur chaque prise de pied, talon haut, et pivote dessus pour tourner les hanches',
        ],
      };
    },
  },
  {
    id: 'drop-knee',
    focus: 'technique',
    points: ['hips'],
    name: 'Lolottes',
    summary:
      'Genou tourné vers le bas et hanche au mur pour allonger le bras, à placer le plus souvent possible.',
    source: 'https://blog.movementgyms.com/7-more-moves-every-climber-should-know',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Lolottes',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}, sur du léger dévers avec des prises de côté`,
          'Place une lolotte dès que possible : pied sur la carre externe, genou tourné vers le bas et vers le mur, hanche collée, puis va chercher loin',
        ],
      };
    },
  },
  {
    id: 'heel-hook',
    focus: 'technique',
    points: ['hooks'],
    name: 'Crochets talon',
    summary:
      'Accrocher le talon et tirer avec l’arrière de la cuisse, sur des blocs qui s’y prêtent.',
    source: 'https://www.publiclands.com/blog/a/indoor-rock-climbing-201',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Crochets talon',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}, en dévers ou avec des volumes`,
          'Place le plus de crochets talon possible : talon sur la prise, pointe du pied tirée vers le bas, et tire avec l’arrière de la cuisse pour coller le bassin',
        ],
      };
    },
  },
  {
    id: 'toe-hook',
    focus: 'technique',
    points: ['hooks', 'tension'],
    name: 'Crochets pointe',
    summary: 'Accrocher le dessus du pied pour empêcher le corps de partir en dévers.',
    source: 'https://blog.movementgyms.com/7-more-moves-every-climber-should-know',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Crochets pointe',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}, en dévers`,
          'Dès que les pieds risquent de partir, accroche le dessus du pied derrière une prise et serre la jambe pour garder le corps au mur',
        ],
      };
    },
  },
  {
    id: 'one-foot-type',
    focus: 'technique',
    points: ['footwork'],
    name: 'Un seul type de pied',
    summary:
      'Monter un même bloc plusieurs fois en s’imposant à chaque fois un seul placement de pied.',
    source: 'https://www.mountainproject.com/v/108661904',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Un seul type de pied',
        target: v,
        instructions: [
          `1 ou 2 blocs en ${c.grade(v)} avec beaucoup de prises`,
          'Monte-les plusieurs fois en t’imposant à chaque passage un seul placement de pied : que des lolottes, puis que des drapeaux intérieurs, puis extérieurs, puis que des crochets talon',
          'Repos 1 min entre chaque passage',
        ],
      };
    },
  },
  {
    id: 'smearing',
    focus: 'technique',
    points: ['slab'],
    name: 'Adhérence',
    summary:
      'Sur une dalle, poser les pieds à plat sur le mur, sans prise, et faire confiance au frottement.',
    source: 'https://sendedition.com/22-climbing-techniques-and-how-to-do-them',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      return {
        title: 'Adhérence',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en dalle, en ${c.grade(v)} ou moins`,
          'Utilise les prises pour les mains, mais pose les pieds directement sur le mur (adhérence), talon bas et poids au-dessus des pieds',
        ],
      };
    },
  },
  {
    id: 'mantle',
    focus: 'technique',
    points: ['pushing'],
    name: 'Rétablissements',
    summary: 'Passer au-dessus d’une prise ou d’un volume en poussant sur les mains, pied haut.',
    source: 'https://www.vdiffclimbing.com/sport-technique-movement/',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Rétablissements',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 2, 6), 'bloc')} en ${c.grade(v)} qui finissent sur une sortie ou un volume`,
          'Pied le plus haut possible, mains qui passent de tirer à pousser (paume vers le bas), puis monte le pied à côté des mains sans poser le genou',
          '3 passages par bloc, repos 1 min entre chaque passage',
        ],
      };
    },
  },
  {
    id: 'stemming',
    focus: 'technique',
    points: ['pushing'],
    name: 'Oppositions',
    summary:
      'Dièdres et dulfers : pousser avec les pieds contre le tirer des mains, ou s’écarter entre deux pans.',
    source: 'https://sendedition.com/22-climbing-techniques-and-how-to-do-them',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Oppositions',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)} dans un dièdre, un angle ou sur une arête`,
          'Cherche les oppositions : pieds qui poussent contre les mains qui tirent (dulfer), ou mains et pieds écartés sur deux pans (cheminée), paumes comprises',
        ],
      };
    },
  },
  {
    id: 'deadpoint',
    focus: 'technique',
    points: ['coordination', 'power'],
    name: 'Lancés contrôlés',
    summary:
      'Aller chercher une prise hors d’atteinte d’un élan des jambes, pieds au mur, et la saisir au point mort.',
    source: 'https://sendedition.com/22-climbing-techniques-and-how-to-do-them',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Lancés contrôlés',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 2, 5), 'bloc')} en ${c.grade(v)} avec un mouvement un peu loin`,
          'Pieds au mur, prends de l’élan avec les jambes et attrape la prise au moment où ton corps ne monte plus (point mort), sans la claquer',
          '3 essais max par mouvement, repos 2 min entre chaque essai',
        ],
      };
    },
  },
  {
    id: 'touched-holds',
    focus: 'technique',
    points: ['reading'],
    name: 'Prises touchées',
    summary:
      'Depuis le sol, sauter attraper une prise avec une main sans la réajuster : précision du geste.',
    source: 'https://www.lacrux.com/fr/?p=57206',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const n = count(c.minutes, 1, 6, 12);
      return {
        title: 'Prises touchées',
        target: c.maxSent - 3,
        instructions: [
          'En dévers, une main sur une bonne prise de départ : saute attraper une prise plus haute avec l’autre main, sans la réajuster',
          'Plus la prise visée est petite, plus c’est dur. Commence sur des grosses prises',
          `${plural(n, 'saut')}, en alternant les mains, repos 1 min entre chaque saut`,
        ],
      };
    },
  },
  {
    id: 'beta-reading',
    focus: 'technique',
    points: ['reading'],
    name: 'Lecture du bloc',
    summary: 'Prévoir chaque mouvement et chaque pied depuis le sol, puis vérifier sur le mur.',
    source: 'https://www.lacrux.com/fr/?p=57206',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 1 - c.light;
      return {
        title: 'Lecture du bloc',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 6, 2, 6), 'bloc')} en ${c.grade(v)} que tu n’as jamais faits`,
          'Avant de grimper, prévois depuis le sol chaque mouvement, chaque pied et la position du corps',
          'Puis essaie de les faire du premier coup (à vue) et note ce qui différait de ton plan',
        ],
      };
    },
  },
  {
    id: 'flash',
    focus: 'technique',
    points: ['reading', 'commitment'],
    name: 'Blocs à vue',
    summary: 'Enchaîner des blocs jamais essayés, un seul essai chacun : lecture et engagement.',
    source: 'https://www.lacrux.com/fr/?p=57206',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 1 - c.light;
      return {
        title: 'Blocs à vue',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} jamais essayés, jusqu’en ${c.grade(v)}`,
          'Un seul essai par bloc, après l’avoir bien lu depuis le sol. Repos 2 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'touch-holds',
    focus: 'technique',
    points: ['recovery'],
    name: 'Caresses',
    summary: 'Toucher toute la prise avant de la saisir pour trouver où elle se tient le mieux.',
    source:
      'https://assets01.sdd1.ch/assets/lbwp-cdn/mobilesport/files/1693404564/mobilesport-escalade-sportive--formes-dentranement-technique-descalade--se-saisir-des-prises-avec-precision.pdf',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Caresses',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 4, 3), 'bloc')} en ${c.grade(v)}`,
          'Avant de saisir chaque prise, parcours-la entièrement de la main, puis prends-la à l’endroit où elle se tient le mieux',
        ],
      };
    },
  },
  {
    id: 'soft-grip',
    focus: 'technique',
    points: ['recovery'],
    name: 'Prises en douceur',
    summary:
      'Serrer chaque prise juste ce qu’il faut : comparer un passage en serrant fort et un passage relâché.',
    source:
      'https://assets01.sdd1.ch/assets/lbwp-cdn/mobilesport/files/1693404564/mobilesport-escalade-sportive--formes-dentranement-technique-descalade--se-saisir-des-prises-avec-precision.pdf',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Prises en douceur',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 2, 5), 'bloc')} en ${c.grade(v)}, 2 passages par bloc`,
          'Premier passage en serrant chaque prise le plus fort possible, second en serrant juste ce qu’il faut pour tenir : sens la différence',
          'Repos 1 min entre chaque passage',
        ],
      };
    },
  },
  {
    id: 'tripod',
    focus: 'technique',
    points: ['balance'],
    name: 'Se figer',
    summary:
      'Avant chaque mouvement, se stabiliser sur trois appuis et ne bouger qu’un membre à la fois.',
    source:
      'https://assets01.sdd1.ch/assets/lbwp-cdn/mobilesport/files/1693404333/mobilesport-escalade-sportive--formes-dentranement-en-lien-avec-la-technique-se-stabiliser-efficacement.pdf',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Se figer',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 3), 'bloc')} en ${c.grade(v)}`,
          'Avant chaque mouvement, fige-toi 2 s, stable sur trois appuis (trépied), puis ne bouge qu’une main ou qu’un pied',
        ],
      };
    },
  },
  {
    id: 'one-foot',
    focus: 'technique',
    points: ['balance'],
    name: 'Un seul pied',
    summary:
      'Grimper avec un seul pied (l’autre jambe libre) : équilibre et précision du pied d’appui.',
    source: 'https://www.shedreamsofalpine.com/blog/climbing-games',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      const n = count(c.minutes, 2, 4, 8);
      return {
        title: 'Un seul pied',
        target: v,
        instructions: [
          `Sur des blocs faciles en ${c.grade(v)} ou moins, grimpe en n’utilisant qu’un seul pied, l’autre jambe libre pour t’équilibrer`,
          `${plural(n, 'passage')} en alternant pied droit et pied gauche, repos 1 min entre chaque passage`,
        ],
      };
    },
  },
  {
    id: 'same-side',
    focus: 'technique',
    points: ['hips'],
    name: 'Traversée de profil',
    summary:
      'Traverser en gardant toujours le même côté du corps contre le mur : hanches, carres, rotations.',
    source: 'https://www.mountainproject.com/forum/message/114032041',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      return {
        title: 'Traversée de profil',
        target: v,
        instructions: [
          `Traverse le mur sur des prises faciles (${c.grade(v)} ou moins) en gardant toujours la même hanche contre le mur, pieds sur les carres`,
          'Fais l’aller vers la droite, le retour vers la gauche, puis recommence 2 fois, repos 2 min entre chaque traversée',
        ],
      };
    },
  },
  {
    id: 'lemon-lime',
    focus: 'technique',
    points: ['footwork', 'resistance'],
    name: 'Aller-retour progressif',
    summary:
      'Ajouter un mouvement à la fois puis redescendre au départ à chaque fois : contrôle et désescalade.',
    source: 'https://www.shedreamsofalpine.com/blog/climbing-games',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Aller-retour progressif',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 6, 2, 5), 'bloc')} en ${c.grade(v)}`,
          'Fais le 1er mouvement et redescends au départ, puis les 2 premiers et redescends, et ainsi de suite jusqu’en haut, sans poser le pied au sol',
          'Repos 3 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'sloper-plumb',
    source: 'https://www.trainingbeta.com/how-to-train-for-compression/',
    focus: 'technique',
    points: ['slopers'],
    name: 'Plats : ligne d’aplomb',
    summary:
      'Sur des blocs à plats, placer le bassin sous la prise, bras tendus : les plats tiennent par la position.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: 'Plats : ligne d’aplomb',
        target: v,
        instructions: [
          `${plural(count(c.minutes, 5, 2, 6), 'bloc')} en ${c.grade(v)}, 2 passages par bloc`,
          'Choisis des blocs à plats. Sur chaque plat, place le bassin sous la prise, bras tendus, et pousse dans les pieds : plus tu es sous le plat, mieux il tient',
          'Repos 2 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'wall-tour',
    source: 'https://www.climbstrong.com/resource-posts/boulder-strength-skill-sessions',
    focus: 'technique',
    points: ['wall-styles', 'slab'],
    name: 'Tour des inclinaisons',
    summary:
      'La même cotation en dalle, en vertical et en dévers, pour repérer et travailler le style où l’on casse.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      const rounds = count(c.minutes, 10, 1, 3);
      return {
        title: 'Tour des inclinaisons',
        target: v,
        instructions: [
          `${3 * rounds} blocs en ${c.grade(v)}, 1 passage par bloc`,
          `${rounds > 1 ? `${rounds} tours, chacun` : 'Un tour'} : un bloc en dalle, un en vertical, un en dévers`,
          'Repos 2 min avant de changer de bloc',
          'Note l’inclinaison où tu tombes ou bloques le plus : c’est elle qu’il faut travailler',
        ],
      };
    },
  },
  {
    id: 'build-the-move',
    source: 'https://climbingcanada.ca/coaches-tool-box/technical-tactical-series-part-1/',
    focus: 'technique',
    points: ['coordination'],
    name: 'Construis-moi le mouvement',
    summary:
      'Reproduire et répéter des mouvements de compétition sur prises faciles : coordination et confiance.',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const moves = [
        'pas croisé façon « skate »',
        'saut avec accroche d’un pied',
        'allonge latérale dynamique avec crochet de pointe opposé',
        'rétablissement jusqu’à pousser bras tendu au-dessus de la tête',
      ];
      const n = count(c.minutes, 6, 2, moves.length);
      return {
        title: 'Construis-moi le mouvement',
        target: v,
        instructions: [
          `Sur des prises faciles (${c.grade(v)} ou moins), reproduis ces mouvements de compétition : ${moves.slice(0, n).join(', ')}`,
          '5 passages sur chaque mouvement, repos 1 min entre chaque passage',
          'Même réussi, refais-le : c’est la répétition qui donne confiance',
        ],
      };
    },
  },
  {
    id: 'rapid-fire',
    source: 'https://climbingcanada.ca/coaches-tool-box/technical-tactical-series-part-1/',
    focus: 'technique',
    points: ['reading', 'projecting'],
    name: 'Blocs en rafale',
    summary:
      'Plusieurs blocs nouveaux dont un à son max : 30 s de lecture, 3 passages chacun, puis on passe au suivant.',
    minMinutes: 15,
    stressful: true,
    build: (c) => {
      const top = c.maxSent - c.light;
      const n = count(c.minutes, 6, 3, 5);
      return {
        title: 'Blocs en rafale',
        target: top,
        instructions: [
          `${n} blocs que tu n’as jamais faits : ${n - 1} entre ${c.grade(top - 3)} et ${c.grade(top - 1)}, et 1 en ${c.grade(top)}`,
          '30 s pour lire chaque bloc depuis le sol, puis 3 passages par bloc, même si tu le réussis au premier',
          'Change de méthode entre deux passages si besoin. Après le 3e, passe au suivant sans y revenir, réussi ou non',
          'Repos 2 min entre chaque passage',
        ],
      };
    },
  },
  {
    id: 'fall-practice',
    source: 'https://brooklynboulders.com/how-to-overcome-your-fear-of-falling-while-climbing/',
    focus: 'technique',
    points: ['fall'],
    name: 'Chutes volontaires',
    summary:
      'Lâcher volontairement en pleine grimpe, en partant bas et en montant peu à peu : apprivoiser la chute.',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      const n = count(c.minutes, 2, 5, 10);
      return {
        title: 'Chutes volontaires',
        target: v,
        instructions: [
          `Sur un bloc facile (${c.grade(v)} ou moins), au-dessus d’un tapis épais, lâche volontairement en pleine grimpe`,
          'Commence les pieds à 50 cm du sol, puis monte d’une prise à chaque chute tant que tu restes à l’aise, jamais au-delà de la mi-hauteur',
          'Lâche en position de grimpe, sans regarder en bas. Réception sur les pieds, genoux fléchis, puis fesses et dos, bras près du corps',
          `${plural(n, 'chute')}, repos 1 min entre chaque chute`,
        ],
      };
    },
  },

  // ---------- Endurance (résistance) : enchaîner sous le niveau max, repos courts
  {
    id: '4x4',
    source: 'https://gripped.com/?p=46491',
    focus: 'endurance',
    points: ['resistance', 'volume'],
    name: '4×4',
    summary: '4 blocs enchaînés sans pause = 1 série ; 2 à 5 séries, 3 à 4 min de repos entre.',
    minMinutes: 15,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const sets = count(c.minutes + 3, 8, 2, 5);
      return {
        title: `4×4 · ${plural(sets, 'série')}`,
        target: v,
        instructions: [
          `Choisis 4 blocs en ${c.grade(v)}`,
          `${plural(sets, 'série')} : une série = enchaîner les 4 blocs sans pause (désescalade ou retour rapide au pied du bloc suivant)`,
          'Repos 3 min entre les séries. Les avant-bras doivent bien gonfler sur les dernières séries',
        ],
      };
    },
  },
  {
    id: 'pyramid',
    source:
      'https://blog.movementgyms.com/improve-your-climbing-endurance-with-a-quick-and-effective-4x4-workout',
    focus: 'endurance',
    points: ['resistance', 'recovery'],
    name: 'Pyramide',
    summary: 'Monter en cotation bloc après bloc jusqu’au sommet, puis redescendre, repos courts.',
    minMinutes: 12,
    build: (c) => {
      const top = c.maxSent - 1 - c.light;
      const steps = [top - 3, top - 2, top - 1, top, top - 1, top - 2, top - 3];
      const rounds = c.minutes >= 26 ? 2 : 1;
      return {
        title: rounds > 1 ? 'Pyramide · 2 tours' : 'Pyramide',
        target: top,
        instructions: [
          `Enchaîne 7 blocs en montant puis en redescendant en cotation : ${steps.map(c.grade).join(' → ')}`,
          '1 passage par bloc, repos 1 min entre chaque passage',
          ...(rounds > 1 ? ['Fais la pyramide 2 fois, repos 4 min entre les deux'] : []),
        ],
      };
    },
  },
  {
    id: '20-in-20',
    source: 'https://trainingforclimbing.com/?p=12701',
    focus: 'endurance',
    points: ['recovery', 'volume'],
    name: 'Un bloc par minute',
    summary:
      'Un bloc à chaque minute (ex. 20 blocs en 20 min), le reste de la minute sert de repos.',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      const n = Math.min(25, c.minutes - 2);
      return {
        title: `${n} blocs en ${n} min`,
        target: v,
        instructions: [
          `${n} blocs différents en ${c.grade(v)}, un au début de chaque minute : le reste de la minute sert de repos`,
          'Vise 80 à 90 % de réussite : si tu tombes souvent, prends des blocs plus faciles',
        ],
      };
    },
  },
  {
    id: 'up-down-up',
    source: 'https://climbinghouse.com/18-week-free-training-program/',
    focus: 'endurance',
    points: ['resistance', 'footwork'],
    name: 'Monter-descendre-monter',
    summary: 'Monter un bloc, le désescalader, le remonter sans poser le pied au sol.',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const n = count(c.minutes, 5, 3, 6);
      return {
        title: 'Monter-descendre-monter',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}, sans mouvement dur ni saut en haut`,
          'Sur chaque bloc : monte, désescalade, puis remonte sans poser le pied au sol',
          'Repos 3 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'linked',
    source: 'https://www.climbstrong.com/resource-posts/progressing-endurance-training-ii',
    focus: 'endurance',
    points: ['resistance'],
    name: 'Blocs enchaînés',
    summary: 'Enchaîner 3 blocs voisins sans toucher le sol, en désescaladant entre eux.',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const n = count(c.minutes, 6, 2, 5);
      return {
        title: 'Blocs enchaînés',
        target: v,
        instructions: [
          `Choisis 3 blocs voisins en ${c.grade(v)}`,
          'Enchaîne-les sans poser le pied au sol : désescalade le premier et passe directement au suivant',
          `${plural(n, 'enchaînement')}, repos 3 min entre chaque enchaînement`,
        ],
      };
    },
  },
  {
    id: 'continuous-traverse',
    source: 'https://www.99boulders.com/?p=170',
    focus: 'endurance',
    points: ['resistance'],
    name: 'Traversée continue',
    summary:
      'Grimper sans s’arrêter plusieurs minutes sur des prises faciles, sans jamais être daubé.',
    minMinutes: 15,
    build: (c) => {
      const v = c.maxSent - 4 - c.light;
      const each = Math.max(5, Math.floor((c.minutes - 4) / 2));
      return {
        title: 'Traversée continue',
        target: v,
        instructions: [
          `2 traversées de ${each} min sans t’arrêter, sur des prises faciles (${c.grade(v)} ou moins), repos 4 min entre les deux`,
          'Tu dois finir essoufflé mais sans avant-bras durs : s’ils gonflent, choisis des prises plus grosses',
        ],
      };
    },
  },

  {
    id: 'intervals-30-30',
    focus: 'endurance',
    points: ['recovery', 'resistance'],
    name: 'Intervalles 30/30',
    summary:
      '30 s de grimpe continue, 30 s de repos, 6 fois ; 5 à 10 min de repos entre les séries.',
    source: 'https://trainingforclimbing.com/?p=12701',
    minMinutes: 12,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const sets = count(c.minutes, 12, 1, 4);
      return {
        title: `Intervalles 30/30 · ${plural(sets, 'série')}`,
        target: v,
        instructions: [
          `Sur un pan ou une zone de mur facile (${c.grade(v)} ou moins) : 30 s de grimpe sans t’arrêter, 30 s de repos au sol, 6 fois = 1 série`,
          `${plural(sets, 'série')}, repos 5 min entre les séries`,
        ],
      };
    },
  },
  {
    id: 'points',
    focus: 'endurance',
    points: ['volume', 'recovery'],
    name: 'Course aux points',
    summary:
      'Pendant 30 à 45 min, chaque bloc se grimpe 2 fois d’affilée ; il rapporte des points selon sa cotation.',
    source:
      'https://gripped.com/indoor-climbing/turn-power-endurance-training-into-a-game-with-this-workout/',
    minMinutes: 20,
    build: (c) => {
      const v = c.maxSent - 2 - c.light;
      return {
        title: `Course aux points · ${c.minutes} min`,
        target: v,
        instructions: [
          `Pendant ${c.minutes} min, enchaîne des blocs jusqu’en ${c.grade(v)} : chaque bloc se grimpe 2 fois de suite, sans repos entre les 2`,
          'Un bloc réussi 2 fois rapporte des points (1 point par cran au-dessus de 4). Note ton total pour le battre la prochaine fois',
          'Alterne un bloc dur et un bloc facile pour récupérer en grimpant',
        ],
      };
    },
  },
  {
    id: 'grade-tour',
    focus: 'endurance',
    points: ['volume'],
    name: 'Tour d’une cotation',
    summary: 'Faire tous les blocs d’une même cotation de la salle, à la suite, repos courts.',
    source: 'https://mojagear.com/?p=2345',
    minMinutes: 15,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      return {
        title: 'Tour d’une cotation',
        target: v,
        instructions: [
          `Fais un maximum de blocs en ${c.grade(v)} de la salle, à la suite`,
          'Repos 1 min entre chaque bloc. Note combien tu en as fait pour progresser d’une séance à l’autre',
        ],
      };
    },
  },
  {
    id: '4x4-same',
    focus: 'endurance',
    points: ['resistance'],
    name: '4×4 sur un même bloc',
    summary:
      'Variante du 4×4 : un même bloc 4 fois d’affilée par série, un bloc différent à chaque série.',
    source: 'https://gripped.com/?p=46491',
    minMinutes: 15,
    build: (c) => {
      const v = c.maxSent - 3 - c.light;
      const sets = count(c.minutes + 3, 8, 2, 5);
      return {
        title: `4×4 sur un même bloc · ${plural(sets, 'série')}`,
        target: v,
        instructions: [
          `${plural(sets, 'bloc')} en ${c.grade(v)}, un par série`,
          'Une série = le même bloc 4 fois de suite, juste le temps de redescendre entre deux passages',
          'Repos 3 min entre les séries',
        ],
      };
    },
  },

  // ---------- Force : peu de mouvements, intensité maximale, repos complets
  {
    id: 'limit',
    source: 'https://trainingbeta.com/?p=21508',
    focus: 'strength',
    points: ['projecting', 'commitment'],
    name: 'Bloc au max',
    summary: 'Quelques blocs au niveau max, essais courts à 100 %, 3 à 5 min de repos complet.',
    minMinutes: 15,
    build: (c) => {
      // Un essai à fond + son repos : environ 4 min
      const attempts = Math.max(3, Math.floor(c.minutes / 4));
      const n = Math.max(1, Math.min(4, Math.round(attempts / 4)));
      const per = Math.max(2, Math.floor(attempts / n));
      return {
        title: 'Bloc au max',
        target: c.project,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(c.project)}, ${per} essais max par bloc`,
          'Repos 3 à 5 min entre chaque essai (enlève les chaussons) : chaque essai à fond',
          'Arrête un bloc dès que les essais n’avancent plus',
        ],
      };
    },
  },
  {
    id: 'sections',
    source: 'https://trainingbeta.com/?p=21508',
    focus: 'strength',
    points: ['projecting'],
    name: 'Travail par sections',
    summary:
      'Découper un bloc au-dessus de son niveau et travailler ses 3 à 4 mouvements les plus durs.',
    minMinutes: 15,
    stressful: true,
    build: (c) => {
      const v = c.project + 1;
      return {
        title: 'Travail par sections',
        target: v,
        instructions: [
          `1 ou 2 blocs en ${c.grade(v)} (au-dessus de ton niveau)`,
          'Travaille séparément les 3 ou 4 mouvements les plus durs, puis essaie de les relier',
          'Repos 3 min entre chaque essai, arrête dès que tu perds en explosivité',
        ],
      };
    },
  },
  {
    id: 'power',
    source: 'https://trainingforclimbing.com/?p=12288',
    focus: 'strength',
    points: ['power', 'commitment'],
    name: 'Mouvements puissants',
    summary: 'Blocs à grands mouvements dynamiques sur bonnes prises : explosivité et engagement.',
    minMinutes: 12,
    stressful: true,
    build: (c) => {
      const v = c.project - 1;
      // 3 essais + repos : environ 10 min par bloc
      const n = count(c.minutes, 10, 1, 4);
      return {
        title: 'Mouvements puissants',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)} avec de grands mouvements sur de bonnes prises (lancés, jetés)`,
          '3 essais max par bloc, repos 3 min entre chaque essai',
          'Engage-toi à fond sur chaque mouvement, réception bras légèrement fléchis',
        ],
      };
    },
  },
  {
    id: 'lock-offs',
    source: 'https://gripped.com/?p=48148',
    focus: 'strength',
    points: ['lock-off'],
    name: 'Blocages',
    summary: 'Bloquer 3 s bras plié avant chaque prise : force de traction et de verrouillage.',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 1;
      const n = count(c.minutes, 4, 3, 6);
      return {
        title: 'Blocages',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}`,
          'Sur chaque prise, bloque 3 s bras plié à 90° avant d’aller chercher la suivante',
          'Repos 3 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'no-feet',
    source: 'https://www.trainingbeta.com/?p=18674',
    focus: 'strength',
    points: ['tension', 'power'],
    name: 'Sans les pieds',
    summary:
      'Grimper un dévers à bonnes prises avec les mains seules (« no foot ») : puissance de bras.',
    minMinutes: 10,
    advanced: true,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 3;
      const n = count(c.minutes, 3, 3, 6);
      return {
        title: 'Sans les pieds',
        target: v,
        instructions: [
          `Sur un dévers à bonnes prises (${c.grade(v)} ou moins), grimpe sans les pieds : mains seules`,
          'Rattrape chaque prise bras légèrement fléchi, épaules engagées, jamais bras tendu',
          `${plural(n, 'passage')} courts, repos 3 min entre chaque passage`,
        ],
      };
    },
  },
  {
    id: 'one-arm-traverse',
    source: 'https://nicros.com/author/brynk/page/27',
    focus: 'strength',
    points: ['power', 'lock-off'],
    name: 'Traversée à un bras',
    summary:
      'Traverser des grosses prises avec une seule main en lâchant-rattrapant : force de contact.',
    minMinutes: 10,
    advanced: true,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 4;
      const n = count(c.minutes, 3, 4, 8);
      return {
        title: 'Traversée à un bras',
        target: v,
        instructions: [
          `Sur un dévers à très bonnes prises (${c.grade(v)} ou moins), traverse avec une seule main en lâchant et rattrapant chaque prise, pieds posés`,
          `${plural(n, 'passage')} en alternant main droite et main gauche, repos 3 min entre chaque passage`,
        ],
      };
    },
  },
  {
    id: 'strength-intervals',
    focus: 'strength',
    points: ['lock-off', 'crimps'],
    name: 'Intervalles de force',
    summary: 'Séries de 3 blocs durs (1 à 2 crans sous le max), 3 min de repos entre chaque bloc.',
    source:
      'https://www.ukclimbing.com/articles/features/lattice_training_series_with_tom_randall_-_part_3_strength+power-11368',
    minMinutes: 15,
    build: (c) => {
      const v = c.maxSent - 1;
      const sets = count(c.minutes, 10, 1, 6);
      return {
        title: `Intervalles de force · ${plural(sets, 'série')}`,
        target: v,
        instructions: [
          `Choisis ${3 * Math.min(2, sets)} blocs connus en ${c.grade(v)}`,
          `${plural(sets, 'série')} de 3 blocs, 1 passage par bloc, repos 3 min entre chaque passage et entre les séries`,
          'Arrête si la qualité baisse',
        ],
      };
    },
  },
  {
    id: 'boulder-campus',
    focus: 'strength',
    points: ['power', 'tension'],
    name: 'Bloc sans les pieds (protocole)',
    summary:
      'Un bloc facile (5 à 6 crans sous le max) grimpé sans les pieds, 3 fois par série, 4 séries.',
    source:
      'https://www.ukclimbing.com/articles/features/lattice_training_series_with_tom_randall_-_part_3_strength+power-11368',
    minMinutes: 15,
    advanced: true,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 5;
      const sets = count(c.minutes, 10, 1, 4);
      return {
        title: `Bloc sans les pieds · ${plural(sets, 'série')}`,
        target: v,
        instructions: [
          `1 bloc en dévers à bonnes prises, en ${c.grade(v)}, grimpé sans les pieds (mains seules)`,
          `${plural(sets, 'série')} de 3 passages, repos 3 min entre chaque passage et entre les séries`,
          'Rattrape chaque prise bras légèrement fléchi, épaules engagées',
        ],
      };
    },
  },
  {
    id: 'one-arm-lunge',
    focus: 'strength',
    points: ['power'],
    name: 'Lancés à un bras',
    summary:
      'Depuis une bonne prise, lancer une seule main vers une prise plus haute : vitesse de contact.',
    source: 'https://www.scribd.com/document/367937845/T4C-Intermediate-Program',
    minMinutes: 10,
    advanced: true,
    stressful: true,
    build: (c) => {
      const n = count(c.minutes, 2, 4, 8);
      return {
        title: 'Lancés à un bras',
        target: c.maxSent - 4,
        instructions: [
          'En dévers, pieds posés, une main sur une très bonne prise : lance l’autre main vers une bonne prise plus haute et rattrape-la',
          `${plural(n, 'lancé')} en alternant les mains, repos 2 min entre chaque lancé`,
        ],
      };
    },
  },
  {
    id: 'dyno',
    focus: 'strength',
    points: ['power', 'coordination', 'commitment'],
    name: 'Jetés',
    summary:
      'Sauter des deux mains vers une prise lointaine : coordination et puissance de tout le corps.',
    source: 'https://www.shedreamsofalpine.com/blog/climbing-games',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 2;
      const n = count(c.minutes, 8, 1, 4);
      return {
        title: 'Jetés',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)} avec un jeté (les deux mains quittent le mur), ou choisis toi-même une prise de départ et une grosse prise cible`,
          'Charge avec les jambes, regarde la cible, et attrape-la bras légèrement fléchis',
          '4 essais max par jeté, repos 2 min entre chaque essai',
        ],
      };
    },
  },
  {
    id: 'grip-limit',
    focus: 'strength',
    points: ['crimps', 'slopers', 'pinches'],
    name: 'Bloc au max sur un type de prise',
    summary:
      'Blocs au niveau max dont le pas dur se fait sur un type de prise qu’on évite (réglettes, plats ou pinces).',
    source: 'https://latticetraining.com/blog/why-do-we-train-half-crimp',
    minMinutes: 12,
    stressful: true,
    build: (c) => {
      const n = count(c.minutes, 12, 1, 3);
      return {
        title: 'Bloc au max sur un type de prise',
        target: c.project,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(c.project)}, 4 essais max par bloc`,
          'Choisis des blocs dont le pas dur se fait sur le type de prise que tu évites d’habitude : réglettes, plats ou pinces',
          'Repos 3 à 5 min entre chaque essai : chaque essai à fond',
        ],
      };
    },
  },
  {
    id: 'compression',
    focus: 'strength',
    points: ['compression', 'tension'],
    name: 'Blocs de compression',
    summary:
      'Blocs où il faut serrer (volumes, arêtes, prises opposées) : force de compression et gainage.',
    source: 'https://www.trainingbeta.com/how-to-train-for-compression/',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.project - 1;
      const n = count(c.minutes, 10, 1, 4);
      return {
        title: 'Blocs de compression',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}, 4 essais max par bloc`,
          'Choisis des blocs où il faut serrer : volumes, arêtes, prises opposées. Pousse vers l’intérieur avec les deux mains et garde les hanches près du mur',
          'Repos 3 min entre chaque essai',
        ],
      };
    },
  },
  {
    id: 'steep-poor-feet',
    focus: 'strength',
    points: ['tension'],
    name: 'Dévers pieds fuyants',
    summary:
      'En dévers, bonnes prises de main mais mauvais pieds : tenir les pieds au mur, c’est la tension du corps.',
    source: 'https://ukbouldering.com/board/index.php/topic,23121.0.html',
    minMinutes: 10,
    build: (c) => {
      const v = c.maxSent - 2;
      const n = count(c.minutes, 6, 2, 5);
      return {
        title: 'Dévers pieds fuyants',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}, 3 essais max par bloc`,
          'Choisis-les en dévers, avec de bonnes prises de main et de mauvais pieds : si les pieds partent, tu tombes',
          'Pousse sur les pointes et tire les pieds vers le mur avec le ventre, hanches près du mur',
          'Repos 3 min entre chaque essai',
        ],
      };
    },
  },
  {
    id: 'varied-dynos',
    focus: 'strength',
    points: ['power', 'coordination'],
    name: 'Lancés variés',
    summary:
      'Lancés et jetés sur des prises, inclinaisons et distances différentes : coordination dynamique.',
    source: 'https://gripped.com/?p=46803',
    minMinutes: 10,
    stressful: true,
    build: (c) => {
      const v = c.maxSent - 2;
      return {
        title: 'Lancés variés',
        target: v,
        instructions: [
          `Prépare 3 lancés différents en ${c.grade(v)} ou moins : change à chaque fois de type de prise, d’inclinaison ou de distance`,
          'Si tu trouves un crochet de pointe à prendre en dynamique, ajoute-le',
          '4 essais max par lancé, repos 2 min entre chaque essai',
          'Charge avec les jambes, regarde la cible, attrape-la bras légèrement fléchis',
        ],
      };
    },
  },
  {
    id: 'fall-in-move',
    focus: 'strength',
    points: ['commitment', 'fall'],
    name: 'Chuter dans le mouvement',
    summary:
      'Sur des blocs à son max, s’engager dans le pas dur jusqu’au bout plutôt que de renoncer, quitte à tomber.',
    source:
      'https://www.strongmindclimbing.com/news-resources/where-do-people-go-wrong-with-fall-practice',
    minMinutes: 12,
    stressful: true,
    build: (c) => {
      const n = count(c.minutes, 12, 1, 3);
      return {
        title: 'Chuter dans le mouvement',
        target: c.project,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(c.project)}, 4 essais max par bloc`,
          'Choisis des blocs où l’on tombe sur les pieds, au-dessus d’un tapis épais',
          'À chaque essai, engage-toi dans le pas dur jusqu’au bout, quitte à tomber : ne redescends pas avant d’avoir essayé',
          'Repos 3 min entre chaque essai',
        ],
      };
    },
  },
];

export interface PickOptions {
  focus: Focus;
  minutes: number;
  maxSent: number;
  /** Douleur signalée ou séance légère : pas d'exercice éprouvant ni réservé aux confirmés. */
  careful: boolean;
  /** Fait varier les exercices d'une séance à l'autre (ex. numéro du jour). */
  seed: number;
  /** Points faibles du profil : au plus un exercice qui les travaille, en premier. */
  weakPoints?: ClimbingPoint[];
  /** Ce que le grimpeur aime : au moins un exercice qui en fait, en dernier. */
  likedPoints?: ClimbingPoint[];
}

/** Pourquoi un exercice est là : point faible, plaisir, ou simple variété. */
export type PickRole = 'weak' | 'liked' | 'other';

export interface Pick {
  exercise: Exercise;
  minutes: number;
  role: PickRole;
  /** Points du profil que l'exercice travaille (vides pour « other »). */
  points: ClimbingPoint[];
}

/**
 * Choisit les exercices du cœur de séance : 1 si le temps est court, jusqu'à 3 sinon, différents,
 * en tournant dans le catalogue selon `seed`, avec leurs minutes (la somme fait `minutes`).
 *
 * Avec un profil : au plus un exercice sur un point faible, en premier (quand on est frais), et
 * au moins un exercice qu'on aime, en dernier (pour finir sur une bonne sensation). Avec un seul
 * exercice, on alterne d'une séance à l'autre. Sans profil, en force, le bloc au max passe d'abord.
 */
export function pickExercises(o: PickOptions): Pick[] {
  const pool = EXERCISES.filter(
    (e) =>
      e.focus === o.focus &&
      (!e.advanced || o.maxSent >= ADVANCED_LEVEL) &&
      !((o.careful && e.stressful) || (o.careful && e.advanced)),
  );
  if (!pool.length || o.minutes <= 0) return [];

  const howMany = o.minutes >= 45 ? 3 : o.minutes >= 25 ? 2 : 1;
  const start = ((o.seed % pool.length) + pool.length) % pool.length;
  const ordered = [...pool.slice(start), ...pool.slice(0, start)];

  const weak = new Set(o.weakPoints ?? []);
  const liked = new Set(o.likedPoints ?? []);
  const isWeak = (e: Exercise) => e.points.some((p) => weak.has(p));
  const isLiked = (e: Exercise) => !isWeak(e) && e.points.some((p) => liked.has(p));
  const fits = (e: Exercise) => Math.floor(o.minutes / howMany) >= e.minMinutes;
  const first = (test: (e: Exercise) => boolean) =>
    ordered.find((e) => test(e) && fits(e)) ?? ordered.find(test);

  let weakPick = first(isWeak);
  let likedPick = first(isLiked);
  if (howMany === 1) {
    // Un seul exercice : point faible et plaisir (ou variété) chacun leur tour
    const turn = ((o.seed % 2) + 2) % 2;
    if (weakPick && likedPick) {
      if (turn) weakPick = undefined;
      else likedPick = undefined;
    } else if (turn) {
      weakPick = likedPick = undefined;
    }
  }

  const chosen: Exercise[] = [];
  if (weakPick) chosen.push(weakPick);
  // Le reste : variété, sans second exercice sur un point faible
  const others = ordered.filter((e) => e !== weakPick && e !== likedPick && !isWeak(e));
  if (o.focus === 'strength' && !weakPick) {
    const limit = others.findIndex((e) => e.id === 'limit');
    if (limit > 0) others.unshift(...others.splice(limit, 1));
  }
  const slots = howMany - chosen.length - (likedPick ? 1 : 0);
  for (const e of others) {
    if (chosen.length >= howMany - (likedPick ? 1 : 0)) break;
    const share = Math.floor(o.minutes / (chosen.length + 1));
    if (share >= e.minMinutes || (chosen.length === 0 && slots > 0)) chosen.push(e);
  }
  if (likedPick) chosen.push(likedPick);

  const role = (e: Exercise): PickRole =>
    e === weakPick ? 'weak' : e === likedPick ? 'liked' : 'other';
  const profilePoints = (e: Exercise): ClimbingPoint[] => {
    const set = role(e) === 'weak' ? weak : role(e) === 'liked' ? liked : new Set();
    return e.points.filter((p) => set.has(p));
  };

  // Minutes réparties à parts égales, arrondies à 5, le reste sur le premier
  const each = Math.max(5, Math.floor(o.minutes / chosen.length / 5) * 5);
  const split = chosen.map((exercise) => ({
    exercise,
    minutes: each,
    role: role(exercise),
    points: profilePoints(exercise),
  }));
  split[0].minutes += o.minutes - each * chosen.length;
  return split;
}

/** Le catalogue en texte, par type de séance, pour le prompt de Mistral. */
export function catalogForPrompt(): string {
  const label: Record<Focus, string> = {
    technique: 'Technique',
    endurance: 'Endurance (résistance)',
    strength: 'Force',
  };
  return (['technique', 'endurance', 'strength'] as Focus[])
    .map((f) => {
      const lines = EXERCISES.filter((e) => e.focus === f).map(
        (e) =>
          `- ${e.name} : ${e.summary} Travaille : ${e.points.map((p) => POINT_LABEL[p]).join(', ')}.${e.advanced ? ' (seulement à partir de 6C, jamais en cas de douleur)' : e.stressful ? ' (jamais en cas de douleur)' : ''}`,
      );
      return `${label[f]} :\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
