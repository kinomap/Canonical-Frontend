# Cloud release candidate 0.1.1

All compilation and native tests run on GitHub-hosted runners only. No operator-host VMs or local CI emulators.

- Ubuntu 24.04 runner: Debian 12 build container; actual .deb installed, GUI initialized under Xvfb, synthetic HTTPS H.264/AAC and HEVC 10-bit/AC3 playback, IPC, pause/progress and uninstall verified on fresh Debian 12 and Ubuntu 24.04 containers.
- Windows runner: UCRT64 mpv and transitive DLL inventory inside installer; actual silent installation; installed frozen app tested with PATH stripped to Windows system directories; named-pipe IPC and both decoder fixtures; silent uninstall.
- macOS runner: native runner architecture (recorded in candidate.json; not a universal build), bundled mpv/dylibs; actual DMG mounted and app copied to an Applications directory; installed app tested without Homebrew PATH; IPC and both decoder fixtures; removal.

Actions are pinned to commit SHAs. Jobs have read-only repository permissions. No production account, stream URL, PAT, or other secrets are used in cloud smoke tests. Test certificate is trusted explicitly only for the local synthetic fixture.

Green artifacts contain the installer, SHA256SUMS, candidate.json and playback receipts. Fan-in checks all three candidates match this commit/run and their SHA-256. No automatic production upload/publication is performed.

## Outstanding release gates

- All three actual cloud jobs and aggregate verification must pass; a source review is not a PASS.
- Verify corresponding-source and license obligations for redistributed native dependencies.
- Confirm Windows signing / Apple Developer ID and notarization policy. Builds here are unsigned candidates, not a signed release.
- Real paid-account API/login/stream end-to-end test using installed Linux candidate under lightweight Xvfb (no VM).
- Protected site download deployment, public visibility / Pro-only download authorization, production Security Center and deployment archive update.

Never upload an untested local artifact in place of a cloud candidate. Never label Apple Silicon output as Intel-compatible or universal.
