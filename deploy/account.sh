#!/usr/bin/env bash
# Customer accounts on the real app (there is no sign-up page). Examples:
#   bash deploy/account.sh create-company --name "Bergs Åkeri AB" --orgnr 556677-8899 --email kontor@bergsakeri.se --user "Anna Berg"
#   bash deploy/account.sh add-user --company 2 --email lars@bergsakeri.se --user "Lars Berg"
#   bash deploy/account.sh list
# The password is printed once; the customer changes it under Inställningar → Ditt lösenord.
set -euo pipefail
cd "$(dirname "$0")/.."
docker compose -f deploy/compose.yaml exec -T app node scripts/account.js "$@"
