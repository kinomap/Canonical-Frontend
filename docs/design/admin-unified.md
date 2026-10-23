# KINOSOTA Admin — unified visual system

## Scope and invariants
Admin presentation only. App imports `admin-theme.css`; public/shared design-system files are untouched. All 38 Vue script/template prefixes are frozen by SHA-256 regression tests. No API, authentication, billing, wallet generation, ad scheduling, routing or state-handler changes. Existing disabled attributes remain authoritative.

## Design direction
Reviewed UI UX Pro Max skill (https://github.com/nextlevelbuilder/ui-ux-pro-max-skill), revision `28327f2f214d31bbd7555ed0c012a5df6484ed96`: full SKILL, pro rules and web quick reference; generated minimal/Swiss dark operational direction using variance 2, motion 1, density 8. Applied semantic color pairs, consistent spacing, readable controls, internal table scrolling, clear selection and focus, reduced motion. Marketing hero/CTA patterns and external-font recommendations were not applicable to an operational admin. Kept local Cyrillic Manrope and blue brand actions; no dependency was added. Vue search returned no matching rule; existing Vue scoped-style conventions were preserved.

## Tokens and composition
- Background #10141c; surface #181e29; raised #202a39; field #111824.
- Text #edf2fa; secondary #b5c2d8; muted #a2b0c7. Blue action #2463c5 / white text; distinct semantic success/warning/danger pairs.
- One flat 248px sidebar (224px tablet), active row with narrow blue marker; no route-only sidebar theme or decorative gradients.
- Main content max 1440px, 32px desktop gutters and 16px mobile gutters. Cards 16–20px padding, groups 16–24px gap. Controls 8px and panels 10px radius.
- 44px controls, visible 3px focus, opaque readable disabled labels. Primary vs secondary vs destructive treatments are explicit; selected tabs remain recognizable.
- Catalog tables scroll inside their region, not the page. Mobile filters stack instead of shrinking. Payment forms have explicit 16px separation between key configuration, address cards and actions.
- Dashboard Master facts use a compact 3-column grid (2 tablet / 1 mobile); monitoring metrics 3×2; system cards 2×2; sessions 2 columns desktop. These are CSS-only rearrangements.

## Verification protocol
Read-only authenticated GET proxy against current live API with local production build, mutations blocked. Do not generate keys, change subscriptions, authorize sessions, submit settings, delete media, run exports or restore backups during UI review. Blank local media fixture replaces playback assets. Inspect desktop and mobile routes, detail cards, safe open/close dialogs and selected tabs. Public UI is outside this release.

## Review corrections
Verified and corrected long-account drawer header wrapping, catalog title-column collapse (fixed-layout tables now retain a readable intrinsic width in their scroll container), node-session table overflow, Telegram dialog filters, mobile system header, login input widths, and balanced mobile session counters. No control was hidden or function removed.

## Release evidence
- Admin 91 tests; Public 164 tests; design tokens 32 tests; Python contracts31 +3 subtests. Both production builds pass (existing large-chunk advisory remains).
- 85 extended UI route/state measurements plus 50 route/payment measurements: no page overflow, no undersized audited buttons, no audited button-label contrast failures, no runtime exceptions. All19 routes checked at1440/390; payment grids additionally320/1024. This is targeted UI QA, not a full WCAG certification.
- Individually inspected before/after renders; corrected mobile title collapse, overlay filters, drawer close affordance and graph labels. Destructive/financial actions intentionally not submitted. Local blank media and read-only proxy image failures are test-harness limitations, not claims about live playback/poster health.
