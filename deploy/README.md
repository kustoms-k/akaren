# Hosting Åkaren

One small Linux server in the EU runs everything:

```
                     ┌──────────── server (Docker) ────────────┐
https://app.<domain> │  Caddy ──► app    real customers         │
https://demo.<domain>│  (HTTPS) ─► demo   fake data, resets 03:30│
                     └──────────────────────────────────────────┘
```

- **app** is the real installation. It runs in production mode, where `DEMO_MODE` is refused. Every customer company lives in the same database, separated by `company_id`.
- **demo** is a separate copy with its own database and only fake data. Prospects log in with one click. It has no API keys, so it never costs money, sends an SMS or sends an email. It wipes and reseeds itself every night.
- **Caddy** gets and renews the HTTPS certificates by itself.

Everything the app stores (the database, vågsedel photos and nightly backups) lives in Docker volumes that survive restarts and updates.

## What it costs

| | Roughly |
|---|---|
| Server: 2 vCPU, 4 GB RAM, 40 GB disk, EU (e.g. Hetzner CX22 in Helsinki or Nuremberg) | €5 / month |
| Domain, e.g. `akaren.se` | 100–200 kr / year |
| Off-site backup space, e.g. a 100 GB storage box (optional but recommended) | €4 / month |

Choose an EU location for GDPR. Sign the hosting provider's data processing agreement (most offer one in their console); your customers' PUB-avtal will refer to it.

## First setup (about 30 minutes)

### 1. Domain and server

1. Buy a domain (Loopia, One.com, Namecheap, …).
2. Create a server with **Ubuntu 24.04**, 2 vCPU / 4 GB RAM, in the EU, and add your SSH key when you create it.
3. In the domain's DNS settings, add two **A records** pointing at the server's IPv4 address:
   - `app` → `<server IP>`
   - `demo` → `<server IP>`

   DNS can take a few minutes to an hour. Check it with `dig +short app.<domain>`.

### 2. Prepare the server

```bash
ssh root@<server IP>
```

The repository is private, so give the server read-only access with a deploy key:

```bash
ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub
```

On GitHub, go to the repo, then **Settings → Deploy keys → Add deploy key**. Paste the key and leave "write access" off. Then:

```bash
git clone git@github.com:kustoms-k/akaren.git /opt/akaren
bash /opt/akaren/deploy/bootstrap.sh
```

`bootstrap.sh` installs Docker and does the rest of the server setup:
- a firewall that only lets through SSH, HTTP and HTTPS
- automatic security updates
- a swap file
- the clock set to Stockholm time

### 3. Settings

```bash
cd /opt/akaren/deploy
cp .env.example .env              # the two domains and your email
cp app.env.example app.env        # the real app
cp demo.env.example demo.env      # the demo
openssl rand -hex 32              # run 4 times: JWT_SECRET + ENCRYPTION_KEY for app.env, and new ones for demo.env
nano .env app.env demo.env
```

- In `app.env`, set `APP_URL`, `PUBLIC_BASE_URL` and `FORTNOX_REDIRECT_URI` to `https://app.<domain>`.
- In `demo.env`, set `APP_URL` and `PUBLIC_BASE_URL` to `https://demo.<domain>`.
- Never commit these files. `.gitignore` already excludes them.
- **Keep a copy of `ENCRYPTION_KEY` somewhere safe**, such as a password manager. Without it, the stored Fortnox connections can't be decrypted.

### 4. Start

```bash
bash /opt/akaren/deploy/update.sh
```

The first build takes about 5 minutes. When it's done, open both addresses:
- `https://demo.<domain>`: click **Logga in**. The demo already has data.
- `https://app.<domain>`: the login page. Nobody has an account yet.

### 5. The first customer

There is no sign-up page; you create each customer:

```bash
bash /opt/akaren/deploy/account.sh create-company --name "Bergs Åkeri AB" --orgnr 556677-8899 \
  --email kontor@bergsakeri.se --user "Anna Berg"
```

The password is printed once. Read it to the customer over the phone; they change it under **Inställningar → Ditt lösenord**.

More people in the same office:

```bash
bash /opt/akaren/deploy/account.sh add-user --company 1 --email lars@bergsakeri.se --user "Lars Berg"
bash /opt/akaren/deploy/account.sh list
```

## Everyday

| To do | Command (on the server) |
|---|---|
| Deploy new code | `bash /opt/akaren/deploy/update.sh` (pulls, rebuilds, restarts, migrates the database) |
| See the app's log | `docker compose -f /opt/akaren/deploy/compose.yaml logs -f app` |
| Status | `docker compose -f /opt/akaren/deploy/compose.yaml ps` |
| Restart | `docker compose -f /opt/akaren/deploy/compose.yaml restart app` |
| Reset the demo now | Log in to the demo and use **Återställ demodata** in the demo guide |

An update takes the app down for a few seconds while the new container starts. Do it outside office hours when you can.

## Backups

The app backs itself up every night:
- **02:00:** a consistent copy of the database, kept for 14 days. A second copy goes to the `app-backup` volume together with the vågsedel photos.
- **Retention job:** photos older than the retention period are removed from the backup too, so backups never keep personal data longer than allowed.

A backup on the same server doesn't protect against losing the server, so copy it somewhere else every night:

1. Get a storage box or any SSH/rsync target. Add the server's key to it with `ssh-copy-id -p 23 u123456@u123456.your-storagebox.de`.
2. Add a cron entry for root (`crontab -e`):

   ```
   15 4 * * * OFFSITE=u123456@u123456.your-storagebox.de:akaren bash /opt/akaren/deploy/backup-offsite.sh >> /var/log/akaren-offsite.log 2>&1
   ```

### Restoring

```bash
cd /opt/akaren
docker compose -f deploy/compose.yaml stop app
docker run --rm -v akaren_app-data:/data -v akaren_app-backup:/backup alpine sh -c \
  'cp /backup/akaren-2026-10-06.db /data/akaren.db && rm -f /data/akaren.db-wal /data/akaren.db-shm \
   && mkdir -p /data/photos && cp -an /backup/photos/. /data/photos/ && chown -R 1000:1000 /data'
docker compose -f deploy/compose.yaml start app
```

Pick the date you want: `ls /var/lib/docker/volumes/akaren_app-backup/_data`. From the off-site copy, rsync it back to that folder first.

## Integrations

All of them go in `deploy/app.env`, followed by `bash deploy/update.sh`.

| Integration | How |
|---|---|
| **AI** (orders, vågsedlar) | `ANTHROPIC_API_KEY`. `AI_MONTHLY_BUDGET_USD` caps the spend per company and month. |
| **SMS** (46elks) | `ELKS_USERNAME`, `ELKS_PASSWORD`. Without them, SMS is simulated and the office shows the QR code instead. |
| **Email** (order confirmations) | `SMTP_*` and `MAIL_FROM`. See `server/.env.example` for Google, Microsoft and EU relays. |
| **Fortnox** | Register the app at developer.fortnox.se with the redirect URI `https://app.<domain>/api/fortnox/callback`, then set `FORTNOX_CLIENT_ID` and `FORTNOX_CLIENT_SECRET`. |

## Security, in short

- **Secrets:** only in `deploy/*.env` on the server, never in git or in the image. The Dockerfile even deletes any local database or `.env` that slipped in.
- **Network:**
  - Only ports 22, 80 and 443 are open. The app itself isn't reachable from outside; only Caddy is.
  - HTTPS everywhere, with HSTS.
  - Rate limits use the real client IP (`TRUST_PROXY=1` behind Caddy).
- **Demo mode:**
  - The real app can't run in demo mode: `compose.yaml` sets `DEMO_MODE: "0"`, and the server refuses `DEMO_MODE` in production.
  - The demo gets blank API keys from `compose.yaml`, whatever is in `demo.env`.
- **Driver links** work on any phone now that the app is on the internet. They are still single-driver magic links that expire.

## When something is wrong

| Symptom | Likely cause |
|---|---|
| The browser says the certificate is invalid | DNS doesn't point at the server yet, or port 80 is blocked. See `docker compose -f deploy/compose.yaml logs caddy`. |
| 502 Bad Gateway | The app isn't up. See `docker compose -f deploy/compose.yaml logs app`; the first lines name any missing setting. |
| The build stops with "Killed" | Out of memory. Check that the swap file exists (`swapon --show`), or use a server with 4 GB. |
| The demo shows old dates | The nightly reset runs at 03:30. Reset by hand from the demo guide. |
