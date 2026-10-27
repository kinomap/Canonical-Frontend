# KINOSOTA Player — candidate 0.1.0

New source implementation, not a modification of MSX_Player.exe. Python 3.11–3.14,
PySide6 native catalogue shell, mpv playback in its own OS window. The site login
and paid subscription are rechecked by the backend; this is not an offline player
or DRM promise. A subscription ending stops lease renewal; already-issued media
tokens retain the existing media-node TTL contract.

## Run / test

Create an isolated virtualenv, `pip install -r requirements.txt`, install mpv using
the OS package manager, then `python launcher.py`. API origin is production HTTPS
watch.scenrix.com; local testing must use mocks, never real credentials in logs.
Tests: `QT_QPA_PLATFORM=offscreen python -m pytest tests` (pytest required).
Real decoder tests also require ffmpeg and openssl and run only against local
HTTPS with a trusted temporary certificate. TLS verification is never disabled.

Login: username/email + password + optional TOTP/recovery code, or explicit
one-use browser pairing. No automatic cookie scraping. Remembered sessions use
only the OS secure vault (Windows Credential Manager / macOS Keychain /
SecretService); if unavailable the app keeps credentials in memory only.
Logout uses existing account-wide session revocation, including the website.

## Native packaging

`python packaging/build.py` on Linux builds an amd64/arm64 .deb for the native
architecture and declares distro mpv and desktop dependencies. Build on the
oldest supported target distribution; PyInstaller does not cross-compile or
remove glibc compatibility requirements. Candidate built on a newer Linux is
NOT evidence it runs on older Ubuntu/Debian. Install test in a disposable VM:
`sudo apt install ./dist/kinosota-player.deb`; remove with
`sudo apt remove kinosota-player`. No installer service, autostart or privileged
post-install script. Exit the account first to clear a saved vault entry.

Windows: build natively with Inno Setup 6 and a reviewed `--mpv-bundle DIRECTORY
--mpv-sha256 DIGEST`; installer is per-user and registers an uninstaller. macOS:
native build creates .app/.dmg; move .app to Applications and remove it normally.
Both require dependency/license review, branded native icon verification, native
install/play/uninstall QA and signing/notarization before publication. Neither
is claimed completed by a Linux build.

## Backend / release

Backend includes additive migration dp01_desktop_client, after bc01_browser_sources.
Apply only as part of a tested release. No source/movie deletion migration.
Downloads are stored outside public static files and authorized on every request.
Default directory: /var/lib/kinosota/player-releases (override via
KINOSOTA_PLAYER_RELEASE_DIR). A valid release.json must explicitly have
`published: true`, a version, and artifacts with exact filename, size and sha256.
Absent/unpublished/corrupt artifacts fail closed. Do not publish candidate builds.
The public page always lists all platforms, honestly marking unpublished ones.

Pending release gates: native Windows/macOS builds/icon verification/signatures, clean Linux
VM installation and uninstall tests, full site + player staging end-to-end test,
operator-reviewed catalogue reconciliation, and production deployment.
