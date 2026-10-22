# Native Telegram login

The login card contains username/email, password, the primary sign-in button and exactly one rectangular Telegram button. There are no account-switch, disconnected-account, bot-confirmation or registration controls on /login. Existing site MFA appears only as a second step.

The official https://telegram.org/js/telegram-widget.js?22 SDK is loaded ahead of a user click; window.Telegram.Login.auth is invoked synchronously by that click. No bot-chat redirect, site confirmation popup or polling is used. Signed payloads are checked server-side with CSRF state, HMAC, five-minute age, replay prevention, rate limits, account status and site MFA intact.

Unlink deletes the social binding, clears telegram_id/telegram_username, notification state and pending Telegram challenges. auth_version invalidates old sessions and MFA challenges. Password users stay signed in with a replacement session. Telegram-only users are signed out to the home page with the specified service-message guidance toast. No account history/funds are deleted or auto-merged.

Historical acct09_telegram_reauth schema/data is retained for migration/rollback compatibility only; revoked_telegram_auth is no longer consulted or updated. Old forced-reauth cookies and local flags are cleared/ignored. Public bot-login endpoints are no longer registered.

Telegram owns its browser session and decides whether to request a phone number or reuse consent. This release does not force provider logout or promise phone entry after site unlink. The user can disconnect website access using Telegram's service message.

QA must distinguish synthetic signed API tests, SDK callback mocks and real browser opening of Telegram from real-user sign-in. No real user's account should be unlinked or funds modified for QA.
