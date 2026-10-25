# Admin interface system

The admin application has a light operational SaaS theme, isolated from the public
website. `src/admin-theme.css` owns the palette and shared geometry; scoped view
styles consume semantic tokens instead of hard-coded dark colours.

## Rules

- Canvas `#f6f8fc`, white cards, slate text, indigo actions. Success/warning/error
  use dark text over soft tinted backgrounds; status is never represented only
  by colour. Do not turn an unknown status into a successful one.
- Main route content and workspace breadcrumb share a 1152px maximum width.
  Navigation is 236px on desktop; below 760px it opens using the existing menu.
- Use the locally bundled Manrope sans-serif for regular text. Monospace is
  reserved for code, raw keys/IDs and formulas. No external font dependency.
- Cards have subtle borders and shadows; 10–14px radii. Controls have visible
  keyboard focus, 180ms transitions and reduced-motion support. Mobile actions
  retain 44px touch targets.
- Ad library uses auto-fill tiles (230–290px desktop, two compact columns on
  phone, one on very narrow screens). Full player and A/B/V/G settings remain
  in the detail view. Do not render a duplicate instruction panel below cards.
- Keep tables internally scrollable, never widen the whole page on mobile.
- Modals, native inputs, status pills, toasts and SVG security labels must use the
  same palette. Security colour constants use CSS tokens; evaluation logic is
  unchanged.

## Regression checks

`npm test` checks existing workflow contracts, reviewed template hashes, compact
ad tile geometry and AA text/action contrast against the actual theme tokens.
`npm run build` typechecks and bundles the application.

Browser QA must cover every main route at desktop and mobile sizes, plus payment
and security tabs, upload/source dialogs, password visibility and ad playback.
Read-only checks must not submit settings, remove creatives, rotate credentials,
or change infrastructure. Never place QA JWTs or private screenshots in Git.
