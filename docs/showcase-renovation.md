# Public showcase renovation — 2026-10-26

## Scope and visual direction

Public Vue storefront only. Existing shared design tokens, Admin/Ad Studio source,
Backend, Fortress/WireGuard and Media Node source/streaming contracts are unchanged.
Artwork is adapted from the two operator-supplied references: a cinematic bee scene
and film-studio footer. Optimized crop sizes and provenance are recorded in
`frontend/public/cinema/v1/manifest.json`.

- Background #0B0D12; accent #F5B800; existing Manrope typography.
- Six/five desktop, four/three tablet and two narrow-screen poster columns.
- Poster containers are exactly 2:3. `object-fit: contain` deliberately overrides
  the requested `cover`: an original of another ratio must not be cropped.
- Accessible semantic sections/articles; one H1 per catalog route, keyboard focus,
  reduced-motion behavior and 44px rail controls.
- Search debounce 250ms; Ctrl/Cmd+K; abort/stale response guard; keyboard selection;
  loading, empty and failure states. No invented notifications or profile identity.
- Official Telegram destination is `https://t.me/kinosota`, confirmed by the operator.
  Subscribe / Мы в Telegram / Сообщество share this URL and use
  `target="_blank" rel="noopener noreferrer"`. Unknown contacts/suggestion
  destinations remain absent rather than invented.
- Cinematic finishing: the Hero overlay fades all four edges into #0B0D12.
  The footer has no hard top border; its background blends from the page canvas.
  Only bee/filmstrip images receive intersecting horizontal/vertical masks, with
  standard and WebKit declarations; navigation, CTA and focus rings remain opaque.

## Images, performance and data

`python3 scripts/build_showcase_posters.py` reads available public catalog entries
and emits content-hashed WebP derivatives (185/342/500w), plus a source manifest.
New catalog images retain their original provider URL until the next image refresh;
this is not a Backend transformation service. Reference graphics have responsive
WebP variants. Reserved geometry and matching skeletons prevent layout movement.
Hero and first six newest posters are eager/high priority; subsequent images lazy.
Player/detail modules are split from the initial catalog bundle.

Public list GET caches have 60s bounded stale-while-revalidate. No auth, account,
personalized or playback responses gain shared/stale caching. Immutable caching
applies only to versioned/hash-named assets; HTML remains revalidated. Gzip is
configured; Brotli is not claimed without an installed supported Nginx module.

## SEO

The build runs `node scripts/generate-seo.mjs` against the public API and creates
metadata-bearing HTML snapshots, sitemap.xml and robots.txt. Telegram can read OG
without executing JavaScript. This is head prerendering, not full-body SSR.
Snapshots and sitemap are regenerated at image build time, not continuously between
releases; newly available/unavailable titles require a fresh build to update them.
Client-side navigation updates metadata from the current catalog response.

Available Movie/TVSeries entities and breadcrumbs use a strict field allowlist.
Stream URLs are never passed into JSON-LD. No fabricated rating/vote count is used;
rich-result eligibility is not guaranteed. Legacy ID URLs still work and canonicalize
to an ID plus readable transliterated title slug. Existing backend IDs are unchanged.
Public query genre snapshots are served only for validated lowercase slugs.

## Verification and release gates

Evidence lives outside Git under
`/home/kos/kinosota/implementation/showcase-renovation-20261026`.
Public Vitest/typecheck/build, Admin regression/build, Nginx tests/syntax and browser
checks must pass before release. Browser QA covers 375/768/1024/1440px, 2:3 geometry,
overflow, H1, Ctrl/Cmd+K, keyboard result selection, JSON-LD and OpenGraph.
Local warm-cache lab timings are not production/field Core Web Vitals and cannot
establish LCP <1.2s or CLS=0 for every user. Measure production after deployment.

Deploy only clean pushed Git through the committed pipeline. Do not hand-edit VPS
sources or run the full installer for a UI update. The public-only release mode must
keep Backend/Admin/Node containers untouched, validate the new Nginx configuration,
retain image/config rollback, and verify actual live Security Center results.
A failed full-suite gate is not waived, and the accepted deploy-kit is not replaced
until release acceptance succeeds.


## Cinema interior correction

The v3 artwork uses a hand-traced transparent mascot silhouette, not a faded square
thumbnail. Text-free left/right scene crops restore the bee/chair/clapper and cinema
projector around live footer content. Their own alpha edges blend with the canvas;
no full reference screenshot, baked navigation or baked Telegram text is used.
Hero is full-bleed outside the constrained poster grid. Decorative catalogue reels
are non-interactive pseudo-elements, never additional poster cards. Responsive
layout keeps artwork separate from focusable navigation and the official Telegram
links. Existing 2:3 poster geometry and player/Backend/Media Node contracts remain
unchanged. New assets live under immutable `/cinema/v3/`, with provenance/geometry
in its manifest.
