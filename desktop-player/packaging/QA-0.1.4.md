# Player 0.1.4 — compact premium shell

## Design contract
- Preserve KINOSOTA dark cinema imagery, warm gold actions and Manrope typography.
- Login uses a bounded native card without a QScrollArea. Decorative hero copy is removed below 940 logical pixels; all authentication controls remain available.
- Minimum supported client area: 760 × 600 logical pixels. At 600–719px height use tighter spacing, not overlapping fields or hidden actions.
- Poster cells budget available viewport height as well as width. Two full rows include the poster, two title lines, and year/quality. Vertical catalogue scrolling remains intentional for the remaining results.
- Search is capped at 480px. Header and navigation use compact native controls.
- Settings is a right-hand child overlay with a dimmed backdrop, animated entry, Escape/outside-click dismissal, contained Tab/Shift+Tab and focus restoration.
- Independent RU/EN interface/title preferences persist via QSettings; no credentials or account data are written there.
- English titles use a supplied English title, otherwise the provider original title, otherwise catalogue title. This fallback is explained in Settings; missing translations are not invented.
- Account information is fetched from existing authenticated GET /account. Subscription is mapped from the real status, not inferred from admin access. 401 closes the drawer, cancels stale callbacks, clears private UI data and shows login immediately.

## Local verification
- 58 native tests pass, including playback/lease cancellation, secure artwork policy, account endpoint authorization, geometry at 760×600, 800×640, 1024×768, 1240×840, 1440×900 and 1920×1080, both interface languages, preference persistence and keyboard containment.
- Individually inspected login, catalogue and settings renders at default/minimum sizes; real public catalogue/artwork, synthetic account values only.
- Native cloud Windows/macOS/Linux install, real fixture playback and uninstall receipts must pass before publication. See canonical release record for the exact successful run and hashes.
- Windows/macOS builds remain unsigned preview releases; no code-signing status is implied.
