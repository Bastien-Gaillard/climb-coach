# @climb-coach/grades

Petite lib TypeScript sans dépendance pour convertir des cotations d'escalade et les couleurs des salles.

## Cotations

| Discipline | Systèmes                                   |
| ---------- | ------------------------------------------ |
| Voie       | française (`french`), YDS (`yds`)          |
| Bloc       | Fontainebleau (`font`), V-scale (`vscale`) |

```ts
import { convertGrade } from '@climb-coach/grades';

convertGrade('6b+', 'french', 'yds'); // '5.10d'
convertGrade('V4', 'vscale', 'font'); // '6B'
convertGrade('6a', 'french', 'font'); // GradeError : pas la même discipline
```

Chaque échelle associe ses cotations à une valeur sur une échelle de référence (l'index français pour la voie, l'index Font pour le bloc). Une conversion = cotation → valeur → cotation la plus proche dans le système cible. En cas d'égalité, on garde la plus basse (mieux vaut se sous-estimer).

## Couleurs de salles

Une salle est un simple objet (dans l'appli, elles sont créées depuis la page « Salles » et stockées en base). Les salles d'exemple de `src/gyms/` servent aux tests :

```json
{
  "id": "alpha-bloc",
  "name": "Salle Alpha (bloc)",
  "discipline": "boulder",
  "system": "font",
  "colors": [{ "color": "rouge", "hex": "#ef4444", "min": "6A+", "max": "6B+" }]
}
```

Une couleur couvre une **plage** de cotations, donc une conversion entre salles renvoie une liste de couleurs avec leur taux de recouvrement :

```ts
import { convertColor, colorsForGrade, EXAMPLE_GYMS, findGym } from '@climb-coach/grades';

const alpha = findGym('alpha-bloc', EXAMPLE_GYMS);
const beta = findGym('beta-bloc', EXAMPLE_GYMS);

convertColor('rouge', alpha, beta);
// [{ color: 'bleu', overlap: 0.67 }, { color: 'vert', overlap: 0.33 }]

colorsForGrade(beta, '6C'); // ['bleu', 'rose'] (plages qui se chevauchent)
```

Une salle est validée par `defineGym` : système cohérent avec la discipline, min ≤ max, pas de couleur en double, codes couleur au format `#rrggbb`. L'API s'en sert avant chaque enregistrement.

## Scripts

```bash
pnpm test   # vitest
pnpm build  # dist/
```
