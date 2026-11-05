#!/bin/sh
# Sauvegarde de la base de prod, à lancer sur le VPS depuis la racine du projet.
# Garde les 14 dernières sauvegardes. Exemple de cron (tous les jours à 3 h) :
#   0 3 * * * cd /opt/climb-coach && ./scripts/backup.sh >> backups/backup.log 2>&1
set -eu

DIR="backups"
mkdir -p "$DIR"
FILE="$DIR/climbcoach-$(date +%Y%m%d-%H%M).sql.gz"

docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T db \
  pg_dump -U climb -d climbcoach --clean --if-exists | gzip > "$FILE"

ls -1t "$DIR"/climbcoach-*.sql.gz | tail -n +15 | xargs -r rm --
echo "$(date -Iseconds) sauvegarde : $FILE"
