#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu 24.04 server for Lasskoll. Run as root:
#   curl -fsSL https://get.docker.com -o /tmp/get-docker.sh   # (this script does it for you)
#   bash deploy/bootstrap.sh
# Installs Docker, turns on the firewall (SSH, HTTP, HTTPS only), automatic security updates and a swap file.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo bash deploy/bootstrap.sh)"; exit 1; fi

echo "==> Updates"
apt-get update -y
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git ufw unattended-upgrades

echo "==> Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
fi
systemctl enable --now docker

echo "==> Firewall: SSH, HTTP, HTTPS"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Swap (2 GB), so building the image never runs out of memory on a small server"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

timedatectl set-timezone Europe/Stockholm || true
echo "==> Done. Next: clone the repo, fill in deploy/.env, deploy/app.env and deploy/demo.env, then run deploy/update.sh"
