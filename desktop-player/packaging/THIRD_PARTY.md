# Third-party components / release gate

The application uses PySide6 / Qt 6 (LGPLv3/GPL/commercial licensing), shiboken6,
httpx and keyring and their dependencies. See the included distribution license
texts and `inventory.json`. This is an onedir build: Qt shared libraries remain
external and replaceable. Do not impose reverse-engineering restrictions that
conflict with LGPL rights. Corresponding source and build/relink instructions
for the exact distributed Qt/PySide6 versions must be provided with a release.

mpv is provided by the distribution package manager on Linux, not copied into
the Linux installer. Windows/macOS bundling requires a reviewed native mpv and
FFmpeg dependency bundle, its notices and the corresponding source/source offer.
mpv/FFmpeg licensing depends on the build options; do not assume every binary is
LGPL. Unreviewed binary downloads and the unrelated MSX_Player.exe are not inputs.

Do not publish any platform until dependency licensing and security review,
native install/uninstall, real HTTPS playback and account revocation tests pass.
Windows Authenticode and macOS Developer ID + notarization require owner-managed
signing identities. Build scripts do not claim to sign or notarize a candidate.

## Manrope font

Bundled static Manrope font weights are distributed under SIL OFL 1.1. The full notice is shipped with the application at kinosota_player/assets/fonts/OFL.txt. See assets/SOURCES.md for origin and conversion details.
