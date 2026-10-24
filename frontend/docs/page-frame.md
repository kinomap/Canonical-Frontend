# Public layout contract

`src/styles/pageFrame.css` owns the route-independent public width (1440px),
responsive gutters (16px / 24px), page top spacing and poster geometry.
The header, catalog roots, genre page and detail roots use those variables.
Do not select frame width using `:has()` of route content or loading markers.

Poster grids, rails and loading placeholders use 2 / 3 / 4 / 5 columns at
mobile / 640 / 1024 / 1280px with shared gaps. Genre category tiles are not
posters and retain their own grid. Login/registration cards remain intentionally
narrow; their outer header never changes width. Account navigation is separate.

The document reserves scrollbar space even on short/empty/error pages, with an
`overflow-y: scroll` fallback. The public body may shrink below the shared
foundation's 320px minimum to accommodate classic scrollbars at a 320px viewport.
No document-wide overflow clipping is used to hide defects.

Regression checks:
- `npm test` includes PageFrame.spec.mjs.
- `npm run build && npm run test:layout` runs the real built Vue app in an
  isolated local Chrome profile with synthetic read-only API fixtures. Requires
  Node 22+ and google-chrome, or set CHROME_BIN. No accounts or VPS are used.
- Layout tests measure loading and settled states for 9 routes at 6 widths,
  populated/empty/failing API states, SPA navigation and scrollbar transitions.
- Set LAYOUT_EVIDENCE to retain measurements and desktop/mobile screenshots.
