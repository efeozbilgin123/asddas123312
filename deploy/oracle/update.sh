#!/usr/bin/env bash
# Kahvehane güncelleyici: GitHub'daki dalda yeni commit varsa çeker, derler, yeniden başlatır.
# Yeni sürüm sağlık kontrolünü geçemezse önceki commit'e geri döner.
# systemd zamanlayıcısı (kahvehane-update.timer) 2 dakikada bir çalıştırır.
#   kahvehane-update          → sadece değişiklik varsa
#   kahvehane-update --force  → her durumda derle ve yeniden başlat
set -euo pipefail

# shellcheck disable=SC1091
[[ -f /etc/kahvehane.env ]] && source /etc/kahvehane.env
BRANCH=${BRANCH:?} PORT=${PORT:-2567} APP=${APP:-/opt/kahvehane/app} SVC_USER=${SVC_USER:-kahvehane}
FORCE=0
[[ ${1:-} == --force ]] && FORCE=1

exec 9>/run/kahvehane-update.lock
flock -n 9 || { echo "Başka bir güncelleme sürüyor."; exit 0; }

as_app() { runuser -u "$SVC_USER" -- env PATH="/opt/node/bin:/usr/bin:/bin" HOME="$(dirname "$APP")" "$@"; }
cd "$APP"

as_app git fetch --quiet origin "$BRANCH"
OLD=$(as_app git rev-parse HEAD)
NEW=$(as_app git rev-parse "origin/$BRANCH")
BAD_FILE=/var/lib/kahvehane-bad-commit
if [[ $OLD == "$NEW" && $FORCE -eq 0 ]]; then exit 0; fi
# a commit that already failed is not retried every 2 minutes; the next commit will be
if [[ $FORCE -eq 0 && -f $BAD_FILE && $(cat "$BAD_FILE") == "$NEW" ]]; then exit 0; fi

deploy() {
  local rev=$1
  as_app git reset --quiet --hard "$rev"
  as_app npm ci --include=dev --no-audit --no-fund --loglevel=error
  as_app npm run build --silent
  systemctl restart kahvehane
}

healthy() {
  for _ in $(seq 1 30); do
    curl -fsS --max-time 2 "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}

echo "Yayınlanıyor: ${OLD:0:7} → ${NEW:0:7} ($(as_app git log -1 --format=%s "$NEW"))"
if deploy "$NEW" && healthy; then
  echo "Tamam: ${NEW:0:7} yayında."
  rm -f "$BAD_FILE"
  # keep the updater itself current
  install -m 755 "$APP/deploy/oracle/update.sh" /usr/local/bin/kahvehane-update
  exit 0
fi

echo "$NEW" > "$BAD_FILE"
echo "Yeni sürüm açılmadı — ${OLD:0:7} sürümüne geri dönülüyor." >&2
if [[ $OLD != "$NEW" ]] && deploy "$OLD" && healthy; then
  echo "Geri dönüldü: ${OLD:0:7}" >&2
fi
exit 1
