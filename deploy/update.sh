#!/usr/bin/env bash
# Deploy the current code: pull, rebuild the image, restart, and check that both sites answer.
# Run from anywhere on the server:  bash deploy/update.sh
# Database migrations run automatically when the app starts. The data volumes are untouched.
set -euo pipefail
cd "$(dirname "$0")/.."

for f in deploy/.env deploy/app.env deploy/demo.env; do
  [ -f "$f" ] || { echo "Missing $f: copy ${f}.example (or deploy/.env.example) and fill it in."; exit 1; }
done
# shellcheck disable=SC1091
set -a; . deploy/.env; set +a

echo "==> Pull"
git pull --ff-only

echo "==> Build and start"
docker compose -f deploy/compose.yaml up -d --build --remove-orphans

echo "==> Waiting for the app"
for i in $(seq 1 30); do
  if docker compose -f deploy/compose.yaml exec -T app node -e "fetch('http://127.0.0.1:3002/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" 2>/dev/null; then
    echo "    app is up"; break
  fi
  [ "$i" -eq 30 ] && { echo "The app did not start. Logs:"; docker compose -f deploy/compose.yaml logs --tail 50 app; exit 1; }
  sleep 2
done

for d in "$APP_DOMAIN" "$DEMO_DOMAIN"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$d/health" || true)
  echo "    https://$d/health -> $code"
done

docker image prune -f >/dev/null
echo "==> Done"
