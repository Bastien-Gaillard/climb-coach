# @climb-coach/grades

Petite lib TypeScript sans dépendance pour convertir des cotations d'escalade et les couleurs des salles.

## Cotations

| Discipline | Systèmes |
|---|---|
| Voie | française (`french`), YDS (`yds`) |
| Bloc | Fontainebleau (`font`), V-scale (`vscale`) |

```ts
import { convertGrade } from '@climb-coach/grades';

convertGrade('6b+', 'french', 'yds'); // '5.10d'
convertGrade('V4', 'vscale', 'font'); // '6B'
convertGrade('6a', 'french', 'font'); // GradeError : pas la même discipline
```

Chaque échelle associe ses cotations à une valeur sur une échelle de référence (l'index français pour la voie, l'index Font pour le bloc). Une conversion = cotation → valeur → cotation la plus proche dans le système cible. En cas d'égalité, on garde la plus basse (mieux vaut se sous-estimer).

## Couleurs de salles

Une salle se décrit par un fichier JSON dans `src/gyms/` :

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
import { convertColor, colorsForGrade, findGym } from '@climb-coach/grades';

convertColor('rouge', findGym('alpha-bloc'), findGym('beta-bloc'));
// [{ color: 'bleu', overlap: 0.67 }, { color: 'vert', overlap: 0.33 }]

colorsForGrade(findGym('beta-bloc'), '6C'); // ['bleu', 'rose'] (plages qui se chevauchent)
```

Les configs sont validées au chargement (`defineGym`) : système cohérent avec la discipline, min ≤ max, pas de couleur en double.

## Ajouter une salle

1. Créer `src/gyms/ma-salle.json`
2. L'ajouter à `GYMS` dans `src/gyms.ts`
3. `pnpm test`

## Scripts

```bash
pnpm test   # vitest
pnpm build  # dist/
```
