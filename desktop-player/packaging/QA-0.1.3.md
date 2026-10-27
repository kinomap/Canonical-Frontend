# Player 0.1.3 candidate

- Native offscreen suite: 53 passed, including small-window scroll/no-overlap regression.
- Web suite: 250 passed; production vue-tsc/Vite build passed.
- Backend focused auth/catalog/desktop suite: 28 passed, including six new refresh security regressions.
- Real production web bundle, mocked API: explicit approval exactly once, no code entry, success state, session-expiry form, mobile internal scrolling, zero page errors.
- Native renders visually inspected at 1440x960 and 800x640; catalog at 1240x840 with live public artwork.
- Browser confirmation, success, reauthentication and 390px reauthentication rendered and visually inspected.
- Refresh uses a separate HttpOnly fixed-lifetime credential (30 days users / 12 hours administrators), CSRF protection, role/status checks, and auth_version revocation. Access JWT TTL remains unchanged. One automatic retry only; no cross-origin interception.
- Session refresh works for a still-valid old browser session; an already-expired pre-upgrade session must sign in once.
- Windows/macOS installers and actual platform install/playback/uninstall require the cloud workflow. Do not mark this release published solely from source tests or screenshots.
