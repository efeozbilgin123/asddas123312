#!/usr/bin/env bash
# Kahvehane — Oracle Cloud (veya herhangi bir Linux VM) için tek seferlik kurulum.
#
# Ne yapar:
#   1. Node 20 ve Caddy'yi kurar (Ubuntu / Oracle Linux, x86 veya ARM — hepsi otomatik).
#   2. Repoyu /opt/kahvehane/app altına çeker, derler, sunucuyu systemd servisi olarak başlatır.
#   3. Caddy ile HTTPS açar (alan adın yoksa <ip>.sslip.io adresini kullanır; sertifika otomatik).
#   4. Her 2 dakikada bir GitHub'daki dala bakan bir zamanlayıcı kurar: yeni commit varsa
#      çeker, derler, yeniden başlatır; bozuk sürüm açılmazsa eskisine geri döner.
#   5. Eski Minecraft sunucusunu bulur ve raporlar (--stop-minecraft ile kapatır).
#
# Kullanım (VM'de, root olarak):
#   curl -fsSL https://raw.githubusercontent.com/efeozbilgin123/asddas123312/claude/hopeful-keller-hzfh29/deploy/oracle/install.sh | sudo bash
#   # veya seçeneklerle:
#   sudo bash install.sh --branch main --domain kahve.ornek.com --stop-minecraft
#
# Tekrar çalıştırmak güvenlidir (her şeyi günceller, veriyi silmez).
set -euo pipefail

REPO_SLUG="efeozbilgin123/asddas123312"
BRANCH="claude/hopeful-keller-hzfh29"
DOMAIN=""
PORT=2567
STOP_MC=0
NODE_VERSION="20.18.1"
CADDY_VERSION="2.8.4"
BASE=/opt/kahvehane
APP=$BASE/app
SVC_USER=kahvehane

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch) BRANCH="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --repo) REPO_SLUG="$2"; shift 2 ;;
    --stop-minecraft) STOP_MC=1; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "Bilinmeyen seçenek: $1" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;31m!!  %s\033[0m\n' "$*"; }

[[ $EUID -eq 0 ]] || { echo "Root olarak çalıştır: sudo bash $0" >&2; exit 1; }

# ---------------------------------------------------------------- system packages
say "Sistem paketleri"
if command -v apt-get >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq git curl xz-utils ca-certificates iptables >/dev/null
elif command -v dnf >/dev/null; then
  dnf install -y -q git curl xz ca-certificates >/dev/null
else
  warn "apt-get ya da dnf bulunamadı; git, curl ve xz'yi elle kur."
fi

case "$(uname -m)" in
  x86_64) NODE_ARCH=x64; CADDY_ARCH=amd64 ;;
  aarch64|arm64) NODE_ARCH=arm64; CADDY_ARCH=arm64 ;;
  *) warn "Desteklenmeyen işlemci: $(uname -m)"; exit 1 ;;
esac

# ---------------------------------------------------------------- swap (small VMs)
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)
if [[ $MEM_MB -lt 2000 ]] && ! swapon --show | grep -q .; then
  say "RAM ${MEM_MB} MB — derleme için 2 GB swap açılıyor"
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# ---------------------------------------------------------------- old Minecraft server
say "Eski Minecraft sunucusu kontrolü"
# only Java processes (so this script's own "--stop-minecraft" argument never matches)
MC_PIDS=$(pgrep -f -i 'java.*(minecraft|server\.jar|paper.*\.jar|spigot.*\.jar|fabric-server)' || true)
MC_UNITS=$(systemctl list-units --all --type=service --no-legend 2>/dev/null | awk '{print $1}' | grep -i -E 'minecraft|mc-?server|papermc' || true)
if [[ -n "$MC_PIDS$MC_UNITS" ]]; then
  echo "Bulundu — süreçler: ${MC_PIDS:-yok} · servisler: ${MC_UNITS:-yok}"
  free -m | sed -n '1,2p'
  if [[ $STOP_MC -eq 1 ]]; then
    for u in $MC_UNITS; do systemctl disable --now "$u" && echo "Durduruldu ve açılışta kapatıldı: $u"; done
    [[ -n "$MC_PIDS" ]] && kill $MC_PIDS 2>/dev/null && echo "Süreçler durduruldu: $MC_PIDS"
  else
    echo "Dokunmadım. Kahvehane ile aynı portları kullanmıyor (MC: 25565)."
    echo "RAM yetmezse: sudo bash $0 --stop-minecraft"
  fi
else
  echo "Çalışan bir Minecraft sunucusu bulunamadı."
fi

# ---------------------------------------------------------------- Node.js
if ! /opt/node/bin/node --version 2>/dev/null | grep -q "v${NODE_VERSION}"; then
  say "Node ${NODE_VERSION} (${NODE_ARCH})"
  tmp=$(mktemp -d)
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -o "$tmp/node.tar.xz"
  rm -rf /opt/node && mkdir -p /opt/node
  tar -xJf "$tmp/node.tar.xz" -C /opt/node --strip-components=1
  rm -rf "$tmp"
fi
export PATH=/opt/node/bin:$PATH

# ---------------------------------------------------------------- Caddy (HTTPS)
if ! /usr/local/bin/caddy version 2>/dev/null | grep -q "v${CADDY_VERSION}"; then
  say "Caddy ${CADDY_VERSION}"
  tmp=$(mktemp -d)
  curl -fsSL "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_${CADDY_ARCH}.tar.gz" -o "$tmp/caddy.tgz"
  tar -xzf "$tmp/caddy.tgz" -C "$tmp" caddy
  install -m 755 "$tmp/caddy" /usr/local/bin/caddy
  rm -rf "$tmp"
fi

# ---------------------------------------------------------------- service user + repo
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir "$BASE" --shell /usr/sbin/nologin "$SVC_USER"
mkdir -p "$BASE" && chown "$SVC_USER:$SVC_USER" "$BASE"
as_app() { runuser -u "$SVC_USER" -- env PATH="/opt/node/bin:$PATH" HOME="$BASE" "$@"; }

REPO_URL="https://github.com/${REPO_SLUG}.git"
if ! git ls-remote --heads "$REPO_URL" >/dev/null 2>&1; then
  # private repo: a read-only deploy key
  say "Repo özel görünüyor — salt okunur bir 'deploy key' gerekiyor"
  KEY=$BASE/.ssh/id_ed25519
  if [[ ! -f $KEY ]]; then
    as_app mkdir -p "$BASE/.ssh"
    as_app ssh-keygen -q -t ed25519 -N '' -C "kahvehane-oracle" -f "$KEY"
  fi
  echo
  echo "GitHub → ${REPO_SLUG} → Settings → Deploy keys → Add deploy key (yazma izni VERME):"
  echo
  cat "$KEY.pub"
  echo
  as_app sh -c "ssh-keyscan -t ed25519 github.com >> $BASE/.ssh/known_hosts 2>/dev/null"
  REPO_URL="git@github.com:${REPO_SLUG}.git"
  if [[ -t 0 ]]; then read -r -p "Anahtarı ekleyince Enter'a bas… " _; fi
  if ! as_app git ls-remote --heads "$REPO_URL" >/dev/null 2>&1; then
    warn "Repoya hâlâ erişilemiyor. Anahtarı ekleyip bu betiği tekrar çalıştır."
    exit 1
  fi
fi

if [[ ! -d $APP/.git ]]; then
  say "Repo çekiliyor (${BRANCH})"
  as_app git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP"
else
  as_app git -C "$APP" remote set-url origin "$REPO_URL"
fi

# ---------------------------------------------------------------- config file
cat > /etc/kahvehane.env <<EOF
# Kahvehane ayarları (değiştirince: sudo systemctl restart kahvehane kahvehane-update.timer)
BRANCH=${BRANCH}
PORT=${PORT}
APP=${APP}
SVC_USER=${SVC_USER}
NODE_ENV=production
EOF

install -m 755 "$APP/deploy/oracle/update.sh" /usr/local/bin/kahvehane-update

# ---------------------------------------------------------------- systemd units
cat > /etc/systemd/system/kahvehane.service <<EOF
[Unit]
Description=Kahvehane oyun sunucusu
After=network-online.target
Wants=network-online.target

[Service]
User=${SVC_USER}
WorkingDirectory=${APP}
EnvironmentFile=/etc/kahvehane.env
Environment=PATH=/opt/node/bin:/usr/bin:/bin
ExecStart=/opt/node/bin/npm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/kahvehane-update.service <<EOF
[Unit]
Description=Kahvehane: GitHub'daki yeni commit'leri çek ve yayınla

[Service]
Type=oneshot
EnvironmentFile=/etc/kahvehane.env
ExecStart=/usr/local/bin/kahvehane-update
EOF

cat > /etc/systemd/system/kahvehane-update.timer <<EOF
[Unit]
Description=Kahvehane güncellemelerini 2 dakikada bir kontrol et

[Timer]
OnBootSec=1min
OnUnitActiveSec=2min

[Install]
WantedBy=timers.target
EOF

# ---------------------------------------------------------------- domain + Caddy
if [[ -z $DOMAIN ]]; then
  IP=$(curl -fsS --max-time 5 https://api.ipify.org || true)
  [[ -n $IP ]] && DOMAIN="${IP//./-}.sslip.io"
fi
cat > /etc/caddy.Caddyfile <<EOF
${DOMAIN:-:80} {
  encode gzip
  reverse_proxy 127.0.0.1:${PORT}
}
EOF
cat > /etc/systemd/system/caddy.service <<'EOF'
[Unit]
Description=Caddy (HTTPS)
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/caddy run --config /etc/caddy.Caddyfile --adapter caddyfile
ExecReload=/usr/local/bin/caddy reload --config /etc/caddy.Caddyfile --adapter caddyfile
Restart=always
AmbientCapabilities=CAP_NET_BIND_SERVICE
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/var/lib/caddy

[Install]
WantedBy=multi-user.target
EOF
mkdir -p /var/lib/caddy

# ---------------------------------------------------------------- firewall (Oracle images block 80/443)
say "Güvenlik duvarı: 80 ve 443"
if command -v firewall-cmd >/dev/null && systemctl is-active --quiet firewalld; then
  firewall-cmd --permanent --add-service=http --add-service=https >/dev/null && firewall-cmd --reload >/dev/null
elif command -v iptables >/dev/null; then
  for p in 80 443; do
    iptables -C INPUT -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null ||
      iptables -I INPUT 5 -p tcp --dport $p -m state --state NEW -j ACCEPT 2>/dev/null ||
      iptables -I INPUT -p tcp --dport $p -j ACCEPT
  done
  if command -v netfilter-persistent >/dev/null; then netfilter-persistent save >/dev/null 2>&1 || true
  elif [[ -d /etc/iptables ]]; then iptables-save > /etc/iptables/rules.v4; fi
fi

# ---------------------------------------------------------------- first deploy
say "İlk derleme ve başlatma (birkaç dakika sürebilir)"
systemctl daemon-reload
systemctl enable kahvehane.service caddy.service kahvehane-update.timer >/dev/null
/usr/local/bin/kahvehane-update --force
systemctl restart caddy
systemctl start kahvehane-update.timer

say "Hazır"
echo "Adres:  https://${DOMAIN:-<sunucu-ip>}"
echo "Durum:  systemctl status kahvehane   ·   Günlük: journalctl -u kahvehane -u kahvehane-update -f"
echo "Dal:    ${BRANCH} — yeni commit'ler 2 dakika içinde otomatik yayına girer."
echo
echo "ÖNEMLİ (bir kerelik, Oracle konsolunda): VCN → Security List → Ingress kuralları"
echo "  0.0.0.0/0 TCP 80 ve 0.0.0.0/0 TCP 443 açık olmalı; yoksa site dışarıdan açılmaz."
