# climb-coach

Je grimpe plusieurs fois par semaine et je ne savais jamais quoi faire en arrivant à la salle. **climb-coach** suit mes séances et, le jour J, me génère la séance du jour à partir de **la séance précédente** et du **temps que j'ai devant moi**.

![Génération d'une séance](docs/generer.png)

## Ce que fait l'appli

- **Suivi des séances** : type (force, endurance, technique), durée, fatigue ressentie, et chaque voie ou bloc tenté, saisi **par sa cotation ou par sa couleur de salle**.
- **Génération de la séance du jour** : je donne le temps dispo, l'appli propose échauffement, cœur de séance, gainage et retour au calme, en tenant compte de :
  - l'alternance des types de travail (force → endurance → technique) ;
  - le repos depuis la dernière séance et la fatigue (séance allégée si besoin, reprise en douceur après 2 semaines d'arrêt) ;
  - la progression (2 réussites au niveau max → on vise un cran au-dessus).
- **Mistral + règles** : la séance est générée par **Mistral** quand une clé est configurée. Sa réponse est validée (schéma, temps, cotations) ; au moindre problème, un **générateur à règles** déterministe prend le relais.
- **Convertisseur** : cotations (française, YDS, Fontainebleau, V-scale) et **couleurs d'une salle à l'autre**.
- **Historique** avec courbe de progression.

| Historique               | Saisie par couleur   | Convertisseur               |
| ------------------------ | -------------------- | --------------------------- |
| ![](docs/historique.png) | ![](docs/seance.png) | ![](docs/convertisseur.png) |

## Stack

|              |                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------- |
| Front        | **Angular 20** (composants standalone, signals, formulaires réactifs, control flow `@if/@for`) |
| API          | **NestJS 11**, validation **zod** (env, body, réponses du LLM)                                 |
| Base         | **PostgreSQL** + **Drizzle ORM** (migrations SQL versionnées)                                  |
| IA           | **Mistral** via l'API `chat/completions` en mode JSON                                          |
| Lib partagée | `@climb-coach/grades`, TypeScript pur, utilisée par l'API **et** le front                      |
| Qualité      | Vitest, Jest, Supertest (e2e sur un vrai Postgres), Karma, ESLint, Prettier, GitHub Actions    |
| Déploiement  | Docker multi-étapes, docker compose, nginx                                                     |

## Architecture

```
climb-coach/
├── packages/grades/     Conversion de cotations et de couleurs (lib sans dépendance)
├── apps/api/            NestJS : séances, génération, conversions
│   ├── src/sessions/      CRUD + normalisation des cotations à la saisie
│   ├── src/plans/         analyse de l'historique, générateurs (règles, Mistral), fallback
│   ├── src/db/            schéma Drizzle, migrations, seed
│   └── test/              tests e2e
└── apps/web/            Angular : génération, saisie, historique, convertisseur
```

```mermaid
flowchart LR
  W[Angular] -->|POST /api/plans/generate| P[PlansService]
  P --> H[(Postgres : historique)]
  P --> A[analyzeHistory]
  A --> M[MistralGenerator]
  M -->|JSON| V{zod + temps + cotations}
  V -->|ok| R[Séance]
  V -->|ko / timeout / pas de clé| RB[RuleBasedGenerator]
  A --> RB
  RB --> R
```

### Quelques choix

- **Le LLM n'est jamais cru sur parole.** La réponse doit passer le même schéma zod que le générateur à règles, tenir dans le temps dispo (sans le gaspiller) et n'utiliser que des cotations qui existent. Sinon : fallback, et la raison est renvoyée au front (« Mistral n'a pas pu répondre (Timeout) »).
- **Les règles préparent le prompt.** `analyzeHistory` calcule le focus, l'intensité, le niveau visé et explique ses choix ; Mistral reçoit ce résumé plutôt que l'historique brut. Les deux générateurs restent cohérents, et le prompt est court.
- **Une échelle de référence par discipline.** Toutes les cotations sont stockées dans un seul système (française pour la voie, Font pour le bloc) avec une valeur numérique : la progression et les comparaisons deviennent triviales.
- **Une couleur = une plage.** Convertir une couleur d'une salle à l'autre renvoie plusieurs couleurs avec leur taux de recouvrement, pas une réponse unique fausse.
- **La lib de conversion est un package à part**, testée seule et importée par l'API et par le front (conversion instantanée côté navigateur).

## Lancer le projet

### Avec Docker

```bash
cp .env.example .env          # optionnel : ajouter MISTRAL_API_KEY
docker compose up --build
```

- Appli : http://localhost:8080
- API : http://localhost:3000/api

Sans clé Mistral, tout fonctionne avec le générateur à règles. Une clé gratuite s'obtient sur la console Mistral (offre Experiment).

### En local

Prérequis : Node 22, pnpm, et la base lancée avec `docker compose up -d db` (exposée sur le port **5433** pour ne pas gêner un Postgres déjà installé).

```bash
pnpm install
pnpm --filter @climb-coach/grades build
cp apps/api/.env.example apps/api/.env
pnpm --filter @climb-coach/api seed    # 8 semaines de séances de démo
pnpm --filter @climb-coach/api dev     # http://localhost:3000/api
pnpm --filter @climb-coach/web start   # http://localhost:4200
```

## Tests

```bash
pnpm test                                   # tous les tests unitaires
pnpm --filter @climb-coach/api test:e2e     # e2e (DATABASE_URL vers une base de test)
pnpm lint && pnpm typecheck
```

Une centaine de tests au total : conversions et configs de salles, règles de génération, validation et fallback Mistral (fetch mocké), endpoints de bout en bout sur Postgres, composants Angular.

## API

| Méthode  | Route                               |                                                     |
| -------- | ----------------------------------- | --------------------------------------------------- |
| `GET`    | `/api/sessions`                     | Séances récentes avec leurs voies                   |
| `POST`   | `/api/sessions`                     | Nouvelle séance (voies par cotation ou par couleur) |
| `DELETE` | `/api/sessions/:id`                 |                                                     |
| `GET`    | `/api/sessions/stats/progression`   | Meilleure réussite par séance                       |
| `POST`   | `/api/plans/generate`               | `{ availableMinutes }` → séance générée             |
| `GET`    | `/api/grades/convert?grade&from&to` | Conversion de cotation                              |
| `GET`    | `/api/gyms`                         | Salles et leurs couleurs                            |
| `GET`    | `/api/gyms/:id/convert?color&to`    | Couleur → couleurs d'une autre salle                |

## Ajouter sa salle

Créer un fichier dans `packages/grades/src/gyms/` (voir le [README de la lib](packages/grades/README.md)) et l'ajouter à `GYMS`. La config est validée au chargement.

## Pistes

- Plusieurs grimpeurs (auth)
- Saisie rapide depuis le téléphone (PWA)
- Ajuster les seuils de progression à partir des données réelles
