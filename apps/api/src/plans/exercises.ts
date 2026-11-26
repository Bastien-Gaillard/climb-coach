import { ClimbingPoint, POINT_LABEL } from '../auth/climbing-points';
import { Focus, PlanInfo } from './plan.schema';

/**
 * Catalogue des formats de cœur de séance, par type. Chaque format se fait avec les blocs déjà
 * tracés dans une salle commerciale : on choisit des blocs d'une couleur, on les grimpe selon une
 * règle simple (nombre, essais, repos). Rien ne dépend d'un mur, d'une prise ou d'une inclinaison.
 * Il sert au générateur par règles et à Mistral (qui le reçoit dans son prompt).
 *
 * Sources : ClimbStrong (« sessions any gym », densité, compétence sur 10 séances), Gripped
 * (3 essais max, course aux points en doublé), La Sportiva (Bouldering Power Hour : circuit dur,
 * répétitions parfaites, volume technique ; Climbing Technique : tes 5 plus durs),
 * TrainingForClimbing et Mojagear (bloc au max), Lattice (flash), Petzl / Charlotte Durif (volume).
 */

/** De quoi rédiger un format : niveau du grimpeur et temps alloué. */
export interface ExerciseContext {
  /**
   * Niveau maîtrisé (valeur sur l'échelle Fontainebleau) : la couleur passée presque à coup sûr,
   * celle du niveau stable déclaré. Jamais la meilleure réussite d'un jour.
   */
  level: number;
  /** Meilleure réussite récente (au moins le niveau) : borne « Tes 5 plus durs ». */
  best?: number;
  /** Niveau visé en force : la couleur au-dessus. */
  project: number;
  /** 1 pour une séance légère, 0 sinon : on baisse les cotations d'un cran. */
  light: number;
  /** Minutes accordées au format. */
  minutes: number;
  /** Types de prise cochés en points faibles (« plats, pinces »), pour orienter le choix des blocs. */
  grips?: string;
  /** Cotation affichée pour une valeur (avec la couleur de la salle si elle est connue). */
  grade: (value: number) => string;
}

export interface ExerciseBlock {
  title: string;
  /** Valeur de la cotation la plus dure demandée. */
  target: number;
  instructions: string[];
}

/**
 * Filière d'un format d'endurance. Fond : effort long et continu, peu intense. Résistance :
 * effort court et intense, les avant-bras gonflent. Une séance ne mélange pas les deux.
 */
export type Energy = 'fond' | 'resistance';

export const ENERGY_LABEL: Record<Energy, string> = { fond: 'fond', resistance: 'résistance' };

export interface Exercise {
  id: string;
  focus: Focus;
  /** Endurance seulement : la filière travaillée. */
  energy?: Energy;
  /** Points faibles qu'il travaille (ou plaisirs qu'il offre), pour le profil du grimpeur. */
  points: ClimbingPoint[];
  name: string;
  /** Une phrase : le principe, pour Mistral et pour s'y retrouver. */
  summary: string;
  /** Temps minimal pour que le format ait du sens. */
  minMinutes: number;
  /** Temps maximal : au-delà, le format n'a plus de sens (on en prend un autre). */
  maxMinutes?: number;
  /** Format lourd, proposé seulement une séance de force sur trois. */
  rare?: boolean;
  /** Page qui décrit le format. */
  source?: string;
  /** Vidéo qui le montre, ou une recherche YouTube faute de bonne démo. */
  video: string;
  /** À éviter quand une douleur est signalée ou que la séance est allégée. */
  stressful?: boolean;
  /** Le détail affiché derrière le ⓘ. */
  info: PlanInfo;
  build: (c: ExerciseContext) => ExerciseBlock;
}

const count = (minutes: number, perItem: number, min: number, max = 25) =>
  Math.min(max, Math.max(min, Math.floor(minutes / perItem)));

/**
 * Minutes par bloc d'un format à essais limités : chaque essai prend environ 1 min sur le mur,
 * suivie du repos. Sert à déduire le nombre de blocs du temps accordé, pour que la durée affichée
 * corresponde à ce qu'on fait vraiment.
 */
export const minutesPerBlock = (attempts: number, rest: number) => attempts * (1 + rest);

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Recherche YouTube, pour les formats sans vidéo qui les montre bien. */
export const ytSearch = (query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

export const EXERCISES: Exercise[] = [
  // ---------- Force : peu de blocs durs, essais courts, longs repos
  {
    id: 'projects',
    focus: 'strength',
    points: ['projecting', 'crimps', 'slopers', 'pinches', 'compression', 'tension'],
    name: 'Projets',
    summary:
      '3 ou 4 blocs très différents dans la couleur au-dessus, de vrais repos entre les essais.',
    minMinutes: 20,
    source:
      'https://trainingforclimbing.com/limit-bouldering-for-building-max-climbing-strength-and-power/',
    video: 'https://www.youtube.com/shorts/jN5O4vo-C5Y',
    info: {
      why: 'Grimper à sa limite est ce qui fait le plus gagner en force et en puissance sur le mur.',
      how: [
        'Choisis des blocs qui ne se ressemblent pas : dévers et vertical, réglettes et plats, statique et dynamique',
        'Chaque essai à fond, puis 5 min de vrai repos : un essai fatigué n’apprend rien',
        'Travaille les mouvements un par un si le bloc entier ne passe pas',
      ],
      pitfalls: [
        'Enchaîner les essais sans repos : on accumule de la fatigue, pas de la force',
        'S’acharner : quand plus rien n’avance, on change de bloc',
      ],
    },
    build: (c) => {
      const n = c.minutes >= 40 ? 4 : 3;
      return {
        title: 'Projets',
        target: c.project,
        instructions: [
          `${n} blocs en ${c.grade(c.project)}`,
          'Choisis-les très différents : inclinaison, prises, style',
          ...(c.grips ? [`Prends-en un en ${c.grips} si la salle en a`] : []),
          'Repos 5 min entre chaque essai, on change de bloc quand les essais n’avancent plus',
        ],
      };
    },
  },
  {
    id: 'three-tries',
    focus: 'strength',
    points: ['commitment', 'power', 'reading'],
    name: '3 essais max',
    summary:
      'Des blocs à son niveau et au-dessus (2 à 8 selon le temps), 3 essais par bloc pour le réussir, pas un de plus.',
    minMinutes: 20,
    source:
      'https://gripped.com/sections/training/develop-your-try-hard-mindset-with-this-workout/',
    video: ytSearch('3 attempts bouldering session try hard'),
    info: {
      why: 'Avec seulement trois essais, chaque essai compte : on apprend à tout donner du premier coup.',
      how: [
        'Lis bien le bloc avant le premier essai',
        'Raté au 3e essai : tu passes au suivant, sans exception',
        'Plus de la moitié des blocs réussis : la prochaine fois, prends-les un cran au-dessus',
      ],
      pitfalls: ['Commencer par les blocs à petites réglettes : garde-les pour quand tu es chaud'],
    },
    build: (c) => {
      // 2,5 essais en moyenne sur des blocs durs, 3 min de repos : environ 10 min par bloc
      const n = count(c.minutes, minutesPerBlock(2.5, 3), 2, 8);
      const above = Math.floor(n / 2);
      // Sans couleur au-dessus connue, tous à son niveau
      const volume =
        c.project > c.level
          ? [
              `${plural(n - above, 'bloc')} en ${c.grade(c.level)}`,
              `${plural(above, 'bloc')} en ${c.grade(c.project)}`,
            ]
          : [`${n} blocs en ${c.grade(c.level)}`];
      return {
        title: '3 essais max',
        target: c.project,
        instructions: [
          ...volume,
          '3 essais max par bloc : raté au 3e, tu passes au suivant',
          'Repos 3 min entre chaque essai',
          'Plus de la moitié réussis : un cran au-dessus la prochaine fois',
        ],
      };
    },
  },
  {
    id: 'hard-circuit',
    focus: 'strength',
    points: ['power', 'lock-off', 'pushing'],
    name: 'Circuit dur',
    summary:
      '5 blocs durs à réussir en 30 min, du haut de son niveau à la couleur au-dessus ; quand ils passent tous, on remplace le plus facile.',
    minMinutes: 30,
    stressful: true,
    source: 'https://www.lasportivausa.com/blogs/blog/gym-series-bouldering-power-hour',
    video: ytSearch('bouldering hard circuit 5 problems 30 minutes'),
    info: {
      why: 'Un même circuit d’une séance à l’autre montre tes progrès, et la règle de remplacement fait monter le niveau tout seul.',
      how: [
        '3 blocs dans le haut de ta couleur et 2 dans la couleur au-dessus : un circuit dur mais faisable',
        'Garde les mêmes 5 blocs tant qu’ils ne passent pas tous en 30 min',
        'Commence par les blocs à grosses prises (plats, pinces), finis par les réglettes',
        'Tous réussis en 30 min : la prochaine fois, remplace le plus facile par un plus dur',
      ],
      pitfalls: [
        'Se reposer moins de 3 min entre deux efforts : le circuit devient de l’endurance',
      ],
    },
    build: (c) => ({
      title: 'Circuit dur',
      target: c.project,
      // 5 blocs dans la couleur au-dessus, c'est hors de portée tant qu'on n'en a réussi qu'un ou
      // deux : 3 dans le haut de sa couleur, 2 au-dessus, et la règle de remplacement fait monter
      instructions: [
        ...(c.project > c.level + 1
          ? [`3 blocs en ${c.grade(c.level + 1)}`, `2 blocs en ${c.grade(c.project)}`]
          : [`5 blocs en ${c.grade(c.project)}`]),
        'À réussir en 30 min, des grosses prises vers les réglettes',
        'Repos 3 min minimum entre deux efforts',
        ...(c.minutes > 35 ? ['Temps restant : reprends les blocs ratés'] : []),
        'Les 5 passent : la prochaine fois, remplace le plus facile par un plus dur',
      ],
    }),
  },
  {
    id: 'work-session',
    focus: 'strength',
    points: ['projecting', 'lock-off', 'tension'],
    name: 'Séance de travail',
    summary:
      '5 ou 6 blocs durs, 8 min d’essais chacun puis 2 min de repos. Une fois toutes les 2 à 3 semaines.',
    minMinutes: 40,
    rare: true,
    stressful: true,
    source: 'https://climbstrong.com/education-center/sessions-any-gym',
    video: 'https://www.youtube.com/watch?v=dyAvbUvY_PU',
    info: {
      why: 'Beaucoup d’essais de qualité sur des blocs durs : on comprend et on construit des mouvements nouveaux.',
      how: [
        '8 min par bloc : essais, travail des mouvements, essais encore',
        'Puis 2 min de repos et on passe au bloc suivant',
        'Prends 1 ou 2 blocs encore plus durs si tu te sens bien',
      ],
      pitfalls: [
        'Séance très chargée pour les doigts : pas plus d’une fois toutes les 2 à 3 semaines',
        'Pas de suspensions max à la poutre après',
      ],
    },
    build: (c) => {
      const n = count(c.minutes, 10, 3, 6);
      return {
        title: 'Séance de travail',
        target: c.project,
        instructions: [
          `${n} blocs en ${c.grade(c.project)}`,
          '8 min d’essais par bloc, puis repos 2 min avant de changer de bloc',
          'Un ou deux plus durs si tu te sens bien',
        ],
      };
    },
  },

  // ---------- Endurance, fond : beaucoup de blocs faciles, peu de repos
  {
    id: 'volume',
    focus: 'endurance',
    energy: 'fond',
    points: ['volume', 'recovery'],
    name: 'Volume',
    summary: 'Beaucoup de blocs sous son niveau, sans trop se reposer entre chacun.',
    minMinutes: 15,
    source:
      'https://www.petzl.com/FR/fr/Sport/Actu/2018-10-5/Les-conseils-d-entrainement-de-Charlotte-Durif',
    video: ytSearch('bouldering volume session easy problems'),
    info: {
      why: 'Enchaîner beaucoup de mouvements faciles construit l’endurance de base et rode les gestes.',
      how: [
        'Des blocs que tu passes du premier coup, sur tous les murs',
        'Environ 1 min de repos entre deux blocs',
      ],
      pitfalls: ['Monter en couleur en cours de route : ça devient une séance de force ratée'],
    },
    build: (c) => {
      const v = c.level - 2 - c.light;
      return {
        title: 'Volume',
        target: v,
        instructions: [
          `${count(c.minutes, 2, 8, 25)} blocs en ${c.grade(v)}`,
          'Repos 1 min environ avant de changer de bloc',
          'Les avant-bras chauffent un peu, jamais au point de rater un bloc facile',
        ],
      };
    },
  },
  {
    id: 'emom',
    focus: 'endurance',
    energy: 'fond',
    points: ['volume', 'recovery', 'resistance'],
    name: 'Un bloc par minute',
    summary:
      'Circuit de 6 à 8 blocs faciles en boucle : un bloc au début de chaque minute, 20 à 25 min.',
    minMinutes: 15,
    maxMinutes: 25,
    video: ytSearch('20 boulders in 20 minutes EMOM climbing'),
    info: {
      why: 'Le rythme imposé apprend à récupérer vite entre deux efforts.',
      how: [
        'Repère ton circuit de 6 à 8 blocs avant de lancer le chrono',
        'Au bout de la liste, tu repars du premier',
        'Si tu rates des blocs, mets plus de faciles dans le mélange',
      ],
      pitfalls: ['Prendre des blocs trop durs : il faut en réussir 8 à 9 sur 10'],
    },
    build: (c) => {
      const minutes = Math.min(25, c.minutes);
      const easy = c.level - 4 - c.light;
      const medium = c.level - 2 - c.light;
      return {
        title: 'Un bloc par minute',
        target: medium,
        instructions: [
          `4 blocs en ${c.grade(easy)}`,
          `3 blocs en ${c.grade(medium)}`,
          'Un bloc au début de chaque minute, le reste de la minute pour récupérer',
          `En boucle pendant ${minutes} min : au bout de la liste, tu repars du premier`,
        ],
      };
    },
  },

  // ---------- Endurance, résistance : efforts courts et intenses, les avant-bras gonflent
  {
    id: '4x4',
    focus: 'endurance',
    energy: 'resistance',
    points: ['resistance'],
    name: '4×4',
    summary:
      '4 blocs enchaînés sans pause = 1 série, 2 à 5 séries, 3 min de repos entre les séries.',
    minMinutes: 15,
    source: 'https://climbstrong.com/education-center/sessions-any-gym',
    video: 'https://www.youtube.com/shorts/XvcQY3qJN1Y',
    info: {
      why: 'Apprendre à continuer de grimper proprement avec les avant-bras qui gonflent.',
      how: [
        'Choisis 4 blocs proches les uns des autres',
        'Enchaîne-les sans pause : c’est une série',
        'Garde les mêmes blocs pour toutes les séries',
      ],
      pitfalls: ['Raccourcir le repos entre les séries : tu ne finiras pas les dernières'],
    },
    build: (c) => {
      const v = c.level - 2 - c.light;
      const sets = count(c.minutes, 8, 2, 5);
      return {
        title: '4×4',
        target: v,
        instructions: [
          `4 blocs en ${c.grade(v)}`,
          'Série = les 4 blocs enchaînés sans pause',
          `${plural(sets, 'série')}, repos 3 min entre les séries`,
        ],
      };
    },
  },
  {
    id: 'pyramid',
    focus: 'endurance',
    energy: 'resistance',
    points: ['resistance', 'recovery'],
    name: 'Pyramide',
    summary:
      '10 blocs déjà réussis, du plus dur au plus facile, 2 min entre les blocs, 1 ou 2 tours.',
    minMinutes: 25,
    source: 'https://climbstrong.com/education-center/sessions-any-gym',
    video: 'https://www.youtube.com/watch?v=-SbpcjMy0M8',
    info: {
      why: 'Beaucoup d’efforts proches de son niveau avec peu de repos : on tient plus longtemps sur un bloc dur.',
      how: [
        'Uniquement des blocs que tu as déjà réussis',
        'Commence par les plus durs, finis par les plus faciles',
        'Chaque semaine : un bloc de plus ou 15 s de repos en moins',
      ],
      pitfalls: ['Y mettre des blocs jamais faits : on passe son temps à chercher les méthodes'],
    },
    build: (c) => {
      const rounds = c.minutes >= 60 ? 2 : 1;
      // 1 min de grimpe et 2 min de repos par bloc
      const n = count((c.minutes - (rounds - 1) * 12) / rounds, 3, 6, 10);
      const hard = Math.round(n / 3);
      const mid = Math.round(n / 3);
      return {
        title: 'Pyramide',
        target: c.level - c.light,
        instructions: [
          `${hard} blocs en ${c.grade(c.level - c.light)}`,
          `${mid} blocs en ${c.grade(c.level - 2 - c.light)}`,
          `${n - hard - mid} blocs en ${c.grade(c.level - 4 - c.light)}`,
          'Des blocs déjà réussis, du plus dur au plus facile',
          'Repos 2 min avant de changer de bloc',
          ...(rounds > 1 ? ['2 tours, repos 12 min entre les tours'] : []),
        ],
      };
    },
  },
  {
    id: 'density',
    focus: 'endurance',
    energy: 'resistance',
    points: ['resistance', 'recovery'],
    name: 'Densité',
    summary:
      '3 ou 4 blocs à son niveau en boucle pendant 20 min ; on compte, et on refait la même séance.',
    minMinutes: 20,
    source: 'https://climbstrong.com/education-center/introduction-density-training',
    video: ytSearch('density bouldering training climbstrong'),
    info: {
      why: 'Faire plus de blocs dans le même temps : un progrès qu’on peut compter d’une séance à l’autre.',
      how: [
        'Toujours les mêmes blocs et la même durée',
        'Note combien de blocs tu as faits',
        'La fois suivante, vise un bloc de plus',
      ],
      pitfalls: ['Changer de blocs à chaque fois : on ne peut plus comparer'],
    },
    build: (c) => {
      const v = c.level - 1 - c.light;
      const bouts = c.minutes >= 55 ? 2 : 1;
      const bout = bouts === 2 ? 20 : Math.min(25, c.minutes);
      return {
        title: 'Densité',
        target: v,
        instructions: [
          `4 blocs en ${c.grade(v)}`,
          `En boucle pendant ${bout} min : un bloc, environ 1 min de repos, le suivant`,
          ...(bouts > 1 ? ['Repos 15 min, puis 20 min de plus sur les mêmes blocs'] : []),
          'Note le nombre de blocs faits : un de plus la prochaine fois',
        ],
      };
    },
  },
  {
    id: 'doubles',
    focus: 'endurance',
    energy: 'resistance',
    points: ['resistance'],
    name: 'Course aux points en doublé',
    summary: 'Un maximum de points en 30 min, mais un bloc ne compte que grimpé 2 fois de suite.',
    minMinutes: 20,
    maxMinutes: 45,
    source:
      'https://gripped.com/indoor-climbing/turn-power-endurance-training-into-a-game-with-this-workout/',
    video: ytSearch('bouldering points game power endurance doubles'),
    info: {
      why: 'Un jeu qui fait enchaîner des efforts intenses sans y penser.',
      how: [
        'Un bloc compte s’il est grimpé 2 fois de suite, sans repos entre les deux',
        'Plus le bloc est dur, plus il rapporte : 1 point par cran au-dessus du plus facile',
        'Alterne dévers et vertical pour récupérer',
      ],
      pitfalls: ['Les avant-bras gonflent, mais on ne doit pas tomber à chaque bloc'],
    },
    build: (c) => {
      const minutes = Math.min(45, c.minutes);
      const v = c.level - 1 - c.light;
      return {
        title: 'Course aux points en doublé',
        target: v,
        instructions: [
          `Blocs en ${c.grade(c.level - 3 - c.light)} à ${c.grade(v)}, au choix`,
          'Un bloc compte s’il est grimpé 2 fois de suite, sans repos entre les deux',
          `Le plus de points en ${minutes} min : les plus durs rapportent plus`,
        ],
      };
    },
  },

  // ---------- Technique : la qualité du mouvement avant la difficulté
  {
    id: 'perfect-repeats',
    focus: 'technique',
    points: ['footwork', 'hips', 'wall-styles', 'slab', 'hooks', 'coordination'],
    name: 'Répétitions parfaites',
    summary:
      '1 à 4 blocs à son niveau, dans un style à améliorer, refaits 3 à 5 fois en 10 à 15 min chacun.',
    minMinutes: 15,
    source: 'https://www.lasportivausa.com/blogs/blog/gym-series-bouldering-power-hour',
    video: ytSearch('bouldering perfect repeats technique drill'),
    info: {
      why: 'Refaire le même bloc en cherchant à mieux le grimper grave la bonne façon de bouger.',
      how: [
        'Choisis des blocs dans un style où tu es moins à l’aise',
        'À chaque passage : moins de bruit, moins d’effort, plus de fluidité',
        'Repos complet entre deux passages',
      ],
      pitfalls: ['Prendre des blocs trop durs : on lutte au lieu de soigner le mouvement'],
    },
    build: (c) => {
      // Le temps se partage entre les blocs : 10 à 15 min chacun, sans minutes perdues
      const n = count(c.minutes, 10, 1, 4);
      const each = Math.floor(c.minutes / n);
      return {
        title: 'Répétitions parfaites',
        target: c.level - c.light,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(c.level - c.light)}, 3 à 5 passages par bloc`,
          `${each} min par bloc, repos complet entre chaque passage`,
          'Chaque passage plus fluide que le précédent',
        ],
      };
    },
  },
  {
    id: 'top-five',
    focus: 'technique',
    points: ['commitment', 'coordination', 'balance'],
    name: 'Tes 5 plus durs',
    summary:
      'Refaire ses blocs les plus durs déjà réussis dans la salle (2 à 5 selon le temps), 3 essais max chacun.',
    minMinutes: 20,
    maxMinutes: 40,
    source: 'https://www.lasportivausa.com/blogs/blog/gym-series-climbing-technique',
    video: ytSearch('repeat hardest boulders 3 attempts technique'),
    info: {
      why: 'Refaire ses meilleurs blocs les rend faciles : la méthode devient un automatisme.',
      how: [
        'Les 5 blocs les plus durs que tu as réussis dans cette salle',
        '3 essais max : raté au 3e, tu passes au suivant, sans exception',
        'Cherche à les grimper plus proprement que la première fois',
      ],
      pitfalls: ['S’entêter au-delà de 3 essais'],
    },
    build: (c) => {
      // 2 essais en moyenne sur des blocs déjà réussis, 3 min de repos : 8 min par bloc
      const n = count(c.minutes, minutesPerBlock(2, 3), 2, 5);
      // Un cran au-dessus du niveau (le haut de la couleur), sans dépasser ce qui a été réussi
      const v = Math.max(c.level, Math.min(c.best ?? c.level, c.level + 1));
      return {
        title: 'Tes 5 plus durs',
        target: v,
        instructions: [
          `${plural(n, 'bloc')} en ${c.grade(v)}, 3 essais max par bloc`,
          'Les plus durs que tu as déjà réussis ici',
          'Repos 3 min entre chaque essai',
          `Arrête au bout de ${c.minutes} min, même s’il reste des blocs`,
        ],
      };
    },
  },
  {
    id: 'flash',
    focus: 'technique',
    points: ['reading', 'commitment'],
    name: 'Flash',
    summary:
      'Les nouveautés de la salle à son niveau maîtrisé, jamais au-dessus : une lecture au sol, un seul essai à fond.',
    minMinutes: 15,
    maxMinutes: 40,
    source:
      'https://latticetraining.com/workout/e743fca6-16fe-4fac-9a91-c568971926a6/flashing-boulders',
    video: 'https://www.youtube.com/shorts/zBdQ7UN6Mc0',
    info: {
      why: 'Lire un bloc et le réussir du premier coup, c’est une compétence qui se travaille.',
      how: [
        'Seulement des blocs jamais essayés, dans ta couleur maîtrisée : tu dois en réussir environ un sur deux',
        'Au sol : repère les prises de pieds, les mains, l’endroit dur',
        'Un seul essai, à fond, et on passe au suivant',
        'Départ pas passé : l’essai compte quand même. Deux échecs de suite : une couleur en dessous',
      ],
      pitfalls: [
        'Regarder quelqu’un d’autre le faire avant : ce n’est plus un flash',
        'Viser trop haut : au-dessus de ton niveau, on reste au sol et on ne travaille ni la lecture ni l’engagement',
      ],
    },
    build: (c) => {
      const v = c.level - c.light;
      return {
        title: 'Flash',
        target: v,
        instructions: [
          // 1 min de lecture, 1 min d'essai, 3 min de repos
          `${count(c.minutes, 5, 3, 8)} blocs en ${c.grade(v)}, jamais essayés`,
          'Lis le bloc au sol, puis un seul essai, à fond',
          'Départ pas passé : l’essai compte quand même',
          `2 échecs de suite : continue en ${c.grade(v - 2)}`,
          'Repos 3 min avant de changer de bloc',
        ],
      };
    },
  },
  {
    id: 'tech-volume',
    focus: 'technique',
    points: ['footwork', 'balance', 'slab', 'hips'],
    name: 'Volume technique',
    summary: 'Beaucoup de blocs faciles, avec la consigne du jour comme seul objectif.',
    minMinutes: 30,
    maxMinutes: 45,
    source: 'https://www.lasportivausa.com/blogs/blog/gym-series-bouldering-power-hour',
    video: 'https://www.youtube.com/watch?v=WbscmZDybdQ',
    info: {
      why: 'Sur des blocs faciles, toute l’attention va au geste : c’est là qu’une nouvelle habitude se prend.',
      how: [
        'Applique la consigne du jour à chaque mouvement',
        'Un mouvement bâclé : redescends d’un mouvement et refais-le',
      ],
      pitfalls: ['Aller vite : le but n’est pas le nombre de blocs'],
    },
    build: (c) => {
      const v = c.level - 4 - c.light;
      return {
        title: 'Volume technique',
        target: v,
        instructions: [
          `${count(c.minutes, 3, 6, 20)} blocs en ${c.grade(v)}`,
          'Un seul objectif : la consigne du jour, sur chaque mouvement',
          'Repos 1 min avant de changer de bloc',
        ],
      };
    },
  },
];

/** Types de prise qu'un projet peut cibler quand ils sont cochés en points faibles. */
export const GRIP_POINTS: readonly ClimbingPoint[] = [
  'crimps',
  'slopers',
  'pinches',
  'compression',
];

export interface PickOptions {
  focus: Focus;
  minutes: number;
  /** Douleur signalée ou séance légère : pas de format éprouvant. */
  careful: boolean;
  /** Fait varier les formats d'une séance à l'autre (ex. numéro du jour). */
  seed: number;
  /** Points faibles du profil : au plus un format qui les travaille, en premier. */
  weakPoints?: ClimbingPoint[];
  /** Ce que le grimpeur aime : au moins un format qui en fait, en dernier. */
  likedPoints?: ClimbingPoint[];
}

/** Pourquoi un format est là : point faible, plaisir, ou simple variété. */
export type PickRole = 'weak' | 'liked' | 'other';

export interface Pick {
  exercise: Exercise;
  minutes: number;
  role: PickRole;
  /** Points du profil que le format travaille (vides pour « other »). */
  points: ClimbingPoint[];
}

/** Moins de 50 min de cœur : un seul format. Au-delà : deux. */
export const formatsFor = (minutes: number) => (minutes >= 50 ? 2 : 1);

const fitsIn = (e: Exercise, minutes: number) =>
  minutes >= e.minMinutes && (e.maxMinutes === undefined || minutes <= e.maxMinutes);

/**
 * Choisit les formats du cœur de séance : 1 sous 50 min, 2 au-delà, différents, en tournant dans
 * le catalogue selon `seed`, avec leurs minutes (la somme fait `minutes`). Chaque format reçoit
 * au moins son temps minimal quand l'autre peut en céder. L'ordre de passage est fixé ensuite
 * par le générateur : le format le plus exigeant en premier.
 *
 * Avec un profil : au plus un format sur un point faible et au moins un format qu'on aime.
 * Avec un seul format, on alterne d'une séance à l'autre.
 * En endurance, les deux formats travaillent la même filière (fond ou résistance).
 * Au plus un format éprouvant (circuit dur, séance de travail) : l'autre reste plus léger.
 */
export function pickExercises(o: PickOptions): Pick[] {
  const pool = EXERCISES.filter(
    (e) =>
      e.focus === o.focus &&
      !(o.careful && e.stressful) &&
      !(e.rare && ((o.seed % 3) + 3) % 3 !== 0),
  );
  if (!pool.length || o.minutes <= 0) return [];

  const howMany = Math.min(formatsFor(o.minutes), pool.length);
  const share = Math.floor(o.minutes / howMany);
  // Un format peut prendre plus que sa part si l'autre se contente de son minimum
  const shortest = Math.min(...pool.map((e) => e.minMinutes));
  const room = o.minutes - (howMany - 1) * shortest;
  const fitsHere = (e: Exercise) =>
    room >= e.minMinutes && (e.maxMinutes === undefined || share <= e.maxMinutes);
  const start = ((o.seed % pool.length) + pool.length) % pool.length;
  let ordered = [...pool.slice(start), ...pool.slice(0, start)];
  // Ce qui tient dans le temps d'abord ; le reste ne sert qu'en dernier recours
  ordered = [...ordered.filter(fitsHere), ...ordered.filter((e) => !fitsHere(e))];

  const weak = new Set(o.weakPoints ?? []);
  const liked = new Set(o.likedPoints ?? []);
  const isWeak = (e: Exercise) => e.points.some((p) => weak.has(p));
  const isLiked = (e: Exercise) => !isWeak(e) && e.points.some((p) => liked.has(p));
  const fits = fitsHere;

  if (howMany > 1 && o.focus === 'endurance') {
    // Fond et résistance ne se mélangent pas dans une même séance
    const anchor =
      ordered.find((e) => isWeak(e) && fits(e)) ??
      ordered.find((e) => isLiked(e) && fits(e)) ??
      ordered[0];
    if (anchor.energy) ordered = ordered.filter((e) => e.energy === anchor.energy);
  }
  const first = (test: (e: Exercise) => boolean) => ordered.find((e) => test(e) && fits(e));

  let weakPick = first(isWeak);
  let likedPick = first(isLiked);
  if (howMany === 1) {
    // Un seul format : point faible et plaisir (ou variété) chacun leur tour
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
  const others = ordered.filter((e) => e !== weakPick && e !== likedPick && !isWeak(e));
  if (o.focus === 'strength' && !weakPick) {
    // Sans point faible, la force commence par des projets
    const projects = others.findIndex((e) => e.id === 'projects' && fits(e));
    if (projects > 0) others.unshift(...others.splice(projects, 1));
  }
  // D'abord des formats dont les minimums tiennent ensemble dans le temps, puis n'importe lesquels
  const slots = howMany - (likedPick ? 1 : 0);
  const reserved = likedPick?.minMinutes ?? 0;
  for (const strict of [true, false]) {
    for (const e of others) {
      if (chosen.length >= slots) break;
      if (chosen.includes(e)) continue;
      // Jamais deux formats éprouvants dans la même séance : un principal, un secondaire plus léger
      if (e.stressful && [...chosen, likedPick].some((x) => x?.stressful)) continue;
      const needed =
        chosen.reduce((sum, x) => sum + x.minMinutes, 0) +
        e.minMinutes +
        reserved +
        (slots - chosen.length - 1) * shortest;
      if (strict && needed > o.minutes) continue;
      chosen.push(e);
    }
  }
  if (likedPick) chosen.push(likedPick);

  const role = (e: Exercise): PickRole =>
    e === weakPick ? 'weak' : e === likedPick ? 'liked' : 'other';
  const profilePoints = (e: Exercise): ClimbingPoint[] => {
    const set = role(e) === 'weak' ? weak : role(e) === 'liked' ? liked : new Set();
    return e.points.filter((p) => set.has(p));
  };

  // Minutes réparties à parts égales, arrondies à 5 et plafonnées, le reste sur un format sans plafond
  const each = Math.max(5, Math.floor(o.minutes / chosen.length / 5) * 5);
  const minutes = chosen.map((e) => Math.min(each, e.maxMinutes ?? each));
  // Un format sous son minimum (le volume technique veut 30 min) en prend à l'autre, s'il en a de trop
  const least = (e: Exercise) => Math.ceil(e.minMinutes / 5) * 5;
  chosen.forEach((e, i) => {
    chosen.forEach((other, j) => {
      const spare = minutes[j] - least(other);
      const give = Math.min(spare, least(e) - minutes[i]);
      if (j !== i && give > 0) {
        minutes[j] -= give;
        minutes[i] += give;
      }
    });
  });
  const split = chosen.map((exercise, i) => ({
    exercise,
    minutes: minutes[i],
    role: role(exercise),
    points: profilePoints(exercise),
  }));
  const rest = o.minutes - split.reduce((sum, p) => sum + p.minutes, 0);
  const taker =
    split.find((p) => p.exercise.maxMinutes === undefined) ??
    split.find((p) => fitsIn(p.exercise, p.minutes + rest)) ??
    split[0];
  taker.minutes += rest;
  return split;
}

/** Part du cœur de séance donnée au format principal (le plus exigeant) quand il y en a deux. */
export const MAIN_SHARE = 0.6;

/**
 * Redonne la majorité du temps au format principal (le premier de `ordered`) : environ 60 % du
 * cœur, arrondi à 5 min, sans sortir des durées min et max de chaque format. Si les durées ne le
 * permettent pas, le partage d'origine est gardé.
 */
export function favorMain<T extends { exercise: Exercise; minutes: number }>(ordered: T[]): T[] {
  if (ordered.length !== 2) return ordered;
  const [main, second] = ordered;
  const total = main.minutes + second.minutes;
  const least = (e: Exercise) => Math.ceil(e.minMinutes / 5) * 5;
  const most = (e: Exercise) => e.maxMinutes ?? total;
  let m = Math.round((total * MAIN_SHARE) / 5) * 5;
  m = Math.min(m, most(main.exercise), total - least(second.exercise));
  // Le secondaire ne dépasse pas son plafond : le surplus revient au principal
  m = Math.max(m, total - most(second.exercise));
  const fits =
    m >= least(main.exercise) &&
    m <= most(main.exercise) &&
    total - m >= least(second.exercise) &&
    total - m <= most(second.exercise);
  if (!fits || m <= main.minutes) return ordered;
  return [
    { ...main, minutes: m },
    { ...second, minutes: total - m },
  ];
}

/** Le catalogue en texte, par type de séance, pour le prompt de Mistral. */
export function catalogForPrompt(): string {
  const label: Record<Focus, string> = {
    technique: 'Technique',
    endurance: 'Endurance (fond ou résistance, jamais les deux dans une séance)',
    strength: 'Force',
  };
  return (['technique', 'endurance', 'strength'] as Focus[])
    .map((f) => {
      const lines = EXERCISES.filter((e) => e.focus === f).map(
        (e) =>
          `- ${e.name}${e.energy ? ` (${ENERGY_LABEL[e.energy]})` : ''} : ${e.summary} Au moins ${e.minMinutes} min${e.maxMinutes ? `, au plus ${e.maxMinutes}` : ''}. Travaille : ${e.points.map((p) => POINT_LABEL[p]).join(', ')}.${e.stressful ? ' (jamais en cas de douleur ni de séance légère)' : ''}`,
      );
      return `${label[f]} :\n${lines.join('\n')}`;
    })
    .join('\n\n');
}
