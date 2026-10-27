# 0.1.1 Linux candidate QA

Candidate only; not published or enabled for production downloading.

- Architecture: amd64. Debian 12 build base, glibc 2.36.
- Package: `kinosota-player.deb`, 82538604 bytes.
- SHA256: `39afd6f4dd98be8b3f41d2b7226b94ac6dbc97c8b047f66fc25138c8a8fc9489`.
- 43 native tests passed, including local HTTPS H.264/AAC and HEVC 10-bit/AC3 decode and IPC playback progress.
- Fresh Debian 12 and Ubuntu 24.04 containers: actual .deb installation, non-root offscreen and X11 login-window/icon/mpv-loader smoke tests, desktop entry validation and removal passed.
- 236 frontend tests and 36 page/state/viewport checks passed. Download authorization failures do not save a package.
- Native inputs checked against the built image; source and candidate match.

These are automated container/fixture results, not native VM/device or production paid-account acceptance. No Windows/macOS installer has been built or signed. Download publication remains blocked pending native acceptance, full staging account/playback/revocation, dependency licensing/source-distribution review, and production asset provisioning. Website and restored catalogue were not changed by this candidate build.
