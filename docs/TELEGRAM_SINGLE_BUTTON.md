# Single-button Telegram login

The login/registration social component renders exactly one Telegram button and, only on failure, a text error. It never renders an account-switch link, detached-account label, action panel or secondary Telegram buttons, regardless of local unlink flags or backend HTTP 409.

The click opens a popup synchronously. For normal sign-in, that window goes to the standard Telegram OAuth endpoint. With `tg_just_unlinked=true`, or a server `require_fresh_reauth` flag on start, the window opens `/telegram-confirm` and immediately creates a fresh browser-bound one-time challenge. An HTTP 409 from the widget completion hands the same window to this confirmation route automatically. If Telegram has already closed its own window, a replacement is attempted; browser popup blocking leaves only the original login button available for a fresh retry, never an alternate control.

The confirmation route is a separate window, not an inline `/login` panel. It automatically starts the request, displays the Telegram app link and matching verification code, waits for explicit confirmation by the matching sender, and automatically completes after that proof. No extra final “Sign in as” click is required in popup mode. MFA, when needed for this confirmation, is completed within that window.

The parent accepts completion only from the exact popup, the site's exact origin and an unpredictable per-window correlation nonce. No JWT, Telegram assertion, challenge token or private value is carried in that completion message. The parent fetches the current user using the backend-issued HttpOnly cookie before navigating. A message alone cannot create a session. Native OAuth still requires the correct popup and exact Telegram origin, with no cached /auth/get fallback. Cancel, timeout and unmount remove listeners and timers.

Backend migration acct09_telegram_reauth and its durable revocation rules are unchanged: even a freshly signed silent widget reply cannot authenticate a revoked Telegram identity without explicit fresh consent. This UI change does not automatically reset Telegram's provider cookies or guarantee a phone-number prompt.

Tests distinguish mocked signed assertions/worker callbacks from a real Telegram app end-to-end login. Production UI checks do not use real user credentials or alter real account bindings.
