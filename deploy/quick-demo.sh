#!/usr/bin/env bash
# A public demo from this computer, right now and for free: the demo copy of Lasskoll (fake data only) behind a
# free tunnel. No account, no domain, no card. Run from anywhere:  bash deploy/quick-demo.sh
#
# Tunnels, tried in order (force one with TUNNEL=cloudflare or TUNNEL=localhostrun):
#   cloudflare    Cloudflare quick tunnel, https://<random-words>.trycloudflare.com. Some networks block it.
#   localhostrun  localhost.run over SSH (built into macOS and Linux), https://<random>.lhr.life.
# The address is new every time the script starts (localhost.run may also change it after a few hours), and the
# demo is only reachable while this computer is awake and the script runs. Both are free services for testing,
# without uptime guarantees. For an address that stays, use the server setup in deploy/README.md. Stop with Ctrl-C.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3030}"
DATA="$ROOT/server/data/public-demo"        # gitignored, separate from the local dev database
BIN_DIR="$ROOT/server/data/bin"
mkdir -p "$DATA" "$BIN_DIR"

[ -f "$ROOT/client/dist/index.html" ] || { echo "==> Building the client"; npm --prefix "$ROOT/client" run build; }

LOG="$DATA/tunnel.log"
# The tunnel functions run in a subshell (for their output), so they hand the tunnel's pid back through a file.
PIDFILE="$DATA/tunnel.pid"
TUNNEL_PID=""
SERVER=""
trap 'kill $TUNNEL_PID $SERVER 2>/dev/null || true' EXIT INT TERM

# Wait up to $2 seconds for a URL matching $1 in the tunnel log.
wait_for_url() {
  for _ in $(seq 1 "$2"); do
    url=$(grep -oE "$1" "$LOG" | head -1 || true)
    [ -n "$url" ] && { echo "$url"; return 0; }
    kill -0 "$TUNNEL_PID" 2>/dev/null || return 1
    sleep 1
  done
  return 1
}

cloudflare() {
  local cf
  cf=$(command -v cloudflared || true)
  if [ -z "$cf" ]; then
    cf="$BIN_DIR/cloudflared"
    if [ ! -x "$cf" ]; then
      local os arch
      os=$(uname -s | tr '[:upper:]' '[:lower:]')
      case "$(uname -m)" in x86_64) arch=amd64 ;; arm64|aarch64) arch=arm64 ;; *) return 1 ;; esac
      echo "==> Downloading cloudflared ($os-$arch)" >&2
      if [ "$os" = darwin ]; then
        curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-$arch.tgz" | tar -xz -C "$BIN_DIR" || return 1
      else
        curl -fsSL -o "$cf" "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$arch" || return 1
      fi
      chmod +x "$cf"
    fi
  fi
  : > "$LOG"
  "$cf" tunnel --no-autoupdate --url "http://127.0.0.1:$PORT" > "$LOG" 2>&1 &
  TUNNEL_PID=$!
  echo "$TUNNEL_PID" > "$PIDFILE"
  # The tunnel's own address is hyphenated words; api.trycloudflare.com in the log is not it.
  wait_for_url 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' 30
}

localhostrun() {
  : > "$LOG"
  ssh -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes -T \
    -R "80:127.0.0.1:$PORT" nokey@localhost.run > "$LOG" 2>&1 &
  TUNNEL_PID=$!
  echo "$TUNNEL_PID" > "$PIDFILE"
  wait_for_url 'https://[a-z0-9]+\.lhr\.life' 30
}

echo "==> Opening a tunnel"
URL=""
for t in ${TUNNEL:-cloudflare localhostrun}; do
  rm -f "$PIDFILE"
  if URL=$("$t"); then
    TUNNEL_PID=$(cat "$PIDFILE")
    echo "    via $t"
    break
  fi
  echo "    $t didn't work, trying the next one" >&2
  [ -f "$PIDFILE" ] && kill "$(cat "$PIDFILE")" 2>/dev/null || true
  URL=""
done
[ -n "$URL" ] || { echo "No tunnel could be opened. Last log:"; cat "$LOG"; exit 1; }

# The demo's own secrets, kept between runs so sessions survive a restart of the script.
SECRETS="$DATA/secrets.env"
[ -f "$SECRETS" ] || printf 'JWT_SECRET=%s\nENCRYPTION_KEY=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" > "$SECRETS"

echo "==> Starting the demo (fake data, seeded on first start, reset every night at 03:30)"
cd "$ROOT/server"
# A clean environment: none of the developer's keys (AI, SMS, email, Fortnox) reach the public demo.
env -i PATH="$PATH" HOME="$HOME" TZ=Europe/Stockholm \
  NODE_ENV=development DEMO_MODE=1 DEMO_AUTO_RESET=1 HOST=127.0.0.1 PORT="$PORT" \
  DATA_DIR="$DATA" CLIENT_DIST="$ROOT/client/dist" APP_URL="$URL" PUBLIC_BASE_URL="$URL" \
  node --env-file="$SECRETS" index.js &
SERVER=$!

for _ in $(seq 1 60); do
  curl -fs "http://127.0.0.1:$PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
echo
echo "    Public demo: $URL"
echo "    Log in with one click. Share the address; it works until you stop this script."
echo
wait $SERVER
