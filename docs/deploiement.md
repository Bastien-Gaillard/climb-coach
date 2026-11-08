# Mise en production

Architecture : le VPS fait tourner les 4 conteneurs de `docker-compose.prod.yml`
(Postgres, API, front nginx, Tailscale), dans un projet Docker séparé nommé `climb-coach`.
**Aucun port n'est publié sur le VPS** et les autres sites ne sont pas touchés : le conteneur
Tailscale rejoint ton réseau privé (tailnet) comme une machine à part, `climb-coach`, et sert
l'appli en HTTPS uniquement à tes appareils connectés à Tailscale.

```
Téléphone (appli Tailscale) ──HTTPS, réseau privé──▶ tailscale ──▶ web (nginx) ──/api──▶ api ──▶ db
```

Adresse finale : `https://climb-coach.<ton-tailnet>.ts.net`. Pas besoin de nom de domaine.

## 1. Préparer Tailscale (une seule fois)

1. Crée un compte sur tailscale.com (offre gratuite) et installe l'appli **Tailscale**
   sur ton téléphone et ton PC, connectés au même compte.
2. Dans la console d'admin, page **DNS** : vérifie que **MagicDNS** est activé, puis active
   **HTTPS Certificates** (nécessaire pour l'adresse en `https://…ts.net`).
3. **Settings > Keys > Generate auth key** : clé non réutilisable, non éphémère.
   Copie-la, elle ne s'affiche qu'une fois.

## 2. Déployer sur le VPS

Le VPS a déjà Docker, rien à installer. Le projet vit dans son propre dossier
et son propre projet Compose : les conteneurs et volumes de tes autres sites ne sont pas concernés.

```bash
sudo mkdir -p /opt/climb-coach && sudo chown $USER: /opt/climb-coach
git clone https://github.com/Bastien-Gaillard/climb-coach.git /opt/climb-coach
# Dépôt privé : utiliser un token GitHub (fine-grained, lecture seule) comme mot de passe
cd /opt/climb-coach

cp .env.prod.example .env.prod
nano .env.prod   # mot de passe Postgres (openssl rand -hex 24), clé Tailscale, clé Mistral
chmod 600 .env.prod

docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api tailscale
```

- Le build (surtout Angular) consomme du CPU et de la RAM pendant quelques minutes :
  lance-le à un moment où tes autres sites sont peu sollicités. Il faut ~2 Go de RAM libres.
- Les migrations de la base s'appliquent toutes seules au démarrage de l'API.

Ensuite, dans la console Tailscale, page **Machines** : sur `climb-coach`, choisis
**Disable key expiry**. Sinon la machine se déconnecte au bout de 6 mois.

**Vérifier** :

- Téléphone avec Tailscale activé → `https://climb-coach.<ton-tailnet>.ts.net` affiche l'appli
  (le premier chargement peut prendre quelques secondes, le temps d'obtenir le certificat).
  « Ajouter à l'écran d'accueil » pour l'avoir comme une appli.
- Tailscale coupé → la page ne répond pas. C'est la preuve que l'appli n'est pas publique.

Le nom de ton tailnet est visible dans la console Tailscale, page **DNS**.

## 3. Reprendre tes séances actuelles (optionnel)

Sur ton PC, avec la base locale lancée (`docker compose up -d db`) :

```bash
docker compose exec -T db pg_dump -U climb -d climbcoach --data-only --exclude-schema=drizzle > climbcoach-data.sql
scp climbcoach-data.sql user@IP_DU_VPS:/opt/climb-coach/
```

Sur le VPS, après le premier démarrage (les tables existent mais sont vides) :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  psql -U climb -d climbcoach < climbcoach-data.sql
rm climbcoach-data.sql
```

## 4. Mettre à jour

```bash
cd /opt/climb-coach && git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
docker image prune -f
```

## 5. Sauvegardes

`scripts/backup.sh` fait un `pg_dump` compressé dans `backups/` et garde les 14 derniers.
À programmer avec `crontab -e` :

```
0 3 * * * cd /opt/climb-coach && ./scripts/backup.sh >> backups/backup.log 2>&1
```

Ces sauvegardes restent sur le VPS : récupère-les de temps en temps sur ton PC
(`scp -r user@IP_DU_VPS:/opt/climb-coach/backups .`).

Restaurer une sauvegarde :

```bash
gunzip -c backups/climbcoach-AAAAMMJJ-HHMM.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db psql -U climb -d climbcoach
```

## 6. Comptes

Chaque compte a ses propres séances, son historique et ses séances générées. Les salles
sont partagées entre tous les comptes. Connexion par simple identifiant, sans mot de passe :
c'est Tailscale qui limite l'accès à l'appli.

Les comptes `kuzimu` et `tophe` sont créés par la migration `0002_users`, et toutes les
données qui existaient avant sont rattachées à `kuzimu`. Pour en ajouter un :

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod exec api node dist/db/create-user.js <nom>
```

### Donner l'accès à quelqu'un

1. La personne installe Tailscale sur son téléphone et crée **son propre** compte Tailscale.
2. Dans ta console Tailscale, page **Machines** : menu « … » de `climb-coach` → **Share** →
   invitation par email.
3. Elle accepte l'invitation : elle ne voit que la machine `climb-coach`, rien d'autre de ton réseau.
4. Elle ouvre `https://climb-coach.<ton-tailnet>.ts.net` (l'adresse complète, comme toi) et se
   connecte avec son identifiant.

Si internet ne marche plus sur son téléphone avec Tailscale activé : Paramètres Android →
**DNS privé** → **Automatique**.
