#!/bin/sh
# Run only inside a disposable Debian/Ubuntu container/VM, never on an operator host.
set -eu
export LANG=C.UTF-8 LC_ALL=C.UTF-8
[ "${KINOSOTA_DISPOSABLE_QA:-}" = 1 ] || { echo 'Disposable QA environment required' >&2; exit 2; }
pkg=${1:?Path to candidate deb required}
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends "$pkg" mpv xvfb xauth desktop-file-utils fonts-dejavu-core python3 ffmpeg openssl
[ "$(dpkg-query -W -f='${Status}' kinosota-player)" = 'install ok installed' ]
[ -f /usr/share/icons/hicolor/512x512/apps/kinosota-player.png ]
desktop-file-validate /usr/share/applications/kinosota-player.desktop
[ -z "$(find /opt/kinosota-player -perm /6000 -type f -print)" ]
useradd --create-home --uid 1500 viewer
su -s /bin/sh viewer -c 'kinosota-player --version'
su -s /bin/sh viewer -c 'QT_QPA_PLATFORM=offscreen timeout 25 kinosota-player --smoke-test'
su -s /bin/sh viewer -c 'QT_QPA_PLATFORM=xcb xvfb-run -a timeout 25 kinosota-player --smoke-test'
# Generate and play synthetic media using the INSTALLED frozen app, as a non-root user.
qa=/tmp/kinosota-installed-qa
install -d -o viewer -g viewer "$qa"
su -s /bin/sh viewer -c "python3 /qa/make_smoke_fixture.py '$qa/fixture'"
result=0
su -s /bin/sh viewer -c "QT_QPA_PLATFORM=xcb xvfb-run -a timeout 90 kinosota-player --playback-smoke-fixture '$qa/fixture' --playback-smoke-report '$qa/playback-smoke.json'" || result=$?
if [ "$result" != 0 ]; then
  cat "$qa/playback-smoke.json" || true
  if [ -n "${KINOSOTA_QA_REPORT_DIR:-}" ]; then cp "$qa/"*.json "$qa/"*.log "$KINOSOTA_QA_REPORT_DIR/" 2>/dev/null || true; fi
  exit "$result"
fi
python3 -c "import json; assert json.load(open('$qa/playback-smoke.json'))['status']=='PASS'"
# 0.2.4: the embedded CinemaSurface of the INSTALLED frozen build: real OpenGL (Mesa llvmpipe under Xvfb) + libmpv +
# bundled kinosota-intro.mp4 + local Pre-roll + film. --smoke-test above never touched this path.
result=0
su -s /bin/sh viewer -c "LIBGL_ALWAYS_SOFTWARE=1 QT_QPA_PLATFORM=xcb xvfb-run -a -s '-screen 0 1280x720x24' timeout 120 kinosota-player --cinema-smoke-test '$qa/fixture' --cinema-smoke-report '$qa/cinema-smoke.json'" || result=$?
if [ "$result" != 0 ]; then
  cat "$qa/cinema-smoke.json" || true
  if [ -n "${KINOSOTA_QA_REPORT_DIR:-}" ]; then cp "$qa/"*.json "$KINOSOTA_QA_REPORT_DIR/" 2>/dev/null || true; fi
  exit "$result"
fi
python3 -c "import json; r=json.load(open('$qa/cinema-smoke.json')); assert r['status']=='PASS' and r['checks']['gl_initialized'] and r['checks']['intro_frame'], r"
# Headless platform: the surface is reported unavailable (offscreen) and the mode skips cleanly with exit 0.
su -s /bin/sh viewer -c "QT_QPA_PLATFORM=offscreen timeout 30 kinosota-player --cinema-smoke-test --cinema-smoke-report '$qa/cinema-smoke-offscreen.json'"
python3 -c "import json; r=json.load(open('$qa/cinema-smoke-offscreen.json')); assert r['status']=='SKIP' and 'offscreen' in (r['unavailable_reason'] or ''), r"
if [ -n "${KINOSOTA_QA_REPORT_DIR:-}" ]; then
  cp "$qa/playback-smoke.json" "$KINOSOTA_QA_REPORT_DIR/playback-smoke-$(. /etc/os-release; echo "$ID-$VERSION_ID").json"
  cp "$qa/cinema-smoke.json" "$KINOSOTA_QA_REPORT_DIR/cinema-smoke-$(. /etc/os-release; echo "$ID-$VERSION_ID").json"
fi
# No real credentials or production API calls; smoke mode never restores a session.
[ -z "$(find /home/viewer -type f -not -path '*/.cache/*' -not -name '.bash*' -not -name '.profile' -print)" ]
test -f /usr/share/metainfo/com.kinosota.Player.metainfo.xml
grep -q 'desktop-id' /usr/share/metainfo/com.kinosota.Player.metainfo.xml
grep -q 'Actions=Uninstall' /usr/share/applications/kinosota-player.desktop
grep -q 'Exec=kinosota-player --uninstall' /usr/share/applications/kinosota-player.desktop
# Website «▶ Смотреть» opens kinosota://watch?launch=<uuid> through the desktop entry.
grep -q '^Exec=kinosota-player %u$' /usr/share/applications/kinosota-player.desktop
grep -q '^MimeType=x-scheme-handler/kinosota;$' /usr/share/applications/kinosota-player.desktop
if [ -f /usr/share/applications/mimeinfo.cache ]; then grep -q 'x-scheme-handler/kinosota=kinosota-player.desktop' /usr/share/applications/mimeinfo.cache; fi
# Match the GUI's fixed dpkg remove path; never open interactive authorization in CI.
dpkg --remove kinosota-player
DEBIAN_FRONTEND=noninteractive apt-get purge -y kinosota-player
[ ! -e /usr/bin/kinosota-player ]
[ ! -e /opt/kinosota-player/kinosota-player ]
[ ! -e /usr/share/applications/kinosota-player.desktop ]
[ ! -e /usr/share/icons/hicolor/512x512/apps/kinosota-player.png ]
[ ! -e /usr/share/metainfo/com.kinosota.Player.metainfo.xml ]
echo 'INSTALL_GUI_ICON_UNINSTALL_PASS'
