# KINOSOTA delivery workflow

> Workspace contracts (read first): `/home/kos/kinosota/AGENTS.md` and
> `/home/kos/kinosota/PLATFORM_ARCHITECTURE.md`.

## ZERO MEDIA ON VPS1/VPS2 (immutable)

- **100% of media bytes go directly `client -> https://<node>.scenrix.com/...`** with a signed token:
  films, series, torrents, ad creatives and the prestart intro (standard and admin upload), for the
  Web SPA, Smart TV (`/tv`, `/tv/lite`), the admin preview and the Desktop Player.
- **The public edge (VPS 2, `nginx.public-only.conf.template`) never relays nor caches media.** No
  `/tv-stream/*`, `/tv-ad/*`, `/stream/*` relay, no `proxy_cache`/`slice`/`intro_cache`. Both servers
  (:80 and :443) answer 404 for `/stream`, `/media/cinema-intro/`, `/cinema/intro/` and audio/video
  files under `/media/`. `/media/` stays only for posters/backdrops; `^~ /cinema/` stays for the UI
  artwork (`/cinema/v1`, `/cinema/v3`, `/cinema/v4`), with `^~ /cinema/intro/` denied before it.
- **No media in the SPA bundle:** `frontend/public/cinema/intro/` is gone. The intro URL always comes
  from `GET /api/v1/cinema/intro` as `https://<node>/intro/<default|custom>/<file>?token=`;
  `cinemaIntro.ts`, `tv-lite.js` and `desktop-player/kinosota_player/intro_source.py` accept only
  such node URLs. No usable answer = no intro (the film is never blocked, never a VPS URL).
- **Never downgrade Media Node URLs** (`tg-node-*`, `torrent-node-*`, `node-*`) from `https://` to
  `http://` (`tv-lite.js` `normalizeTvUrl`, `tvNativePlayer.ts`): port 80 on the nodes is closed and
  their RSA-2048 certificates work on old TVs.
- **4K stays:** `/tv` (`TvPlayerView.vue`) never sends a frame ceiling; only `/tv/lite` (Orsay and
  other legacy TVs) sends `max_width=1920&max_height=1080` and handles `409 TV_MEDIA_UNSUPPORTED`
  (+ `alternative_source_id`). TV ads and intro use the surfaces `tv_telegram` / `tv_torrent`
  (Ad Studio and «Интро престарта» in `admin-frontend`).
- **CONTRACT CHANGE STOP:** a "temporary" media proxy/cache on VPS 1/VPS 2 (TV TLS, CORS, slow
  start) is a contract change: stop, report the conflict and solve it on `kinomap/node`.

## Git flow and delivery

Changes go PR-only: a topic branch from current `main` -> tests and builds -> Pull Request into
`main`. Never commit or push directly to `main`; never hot-fix a VPS outside Git and the
control-plane release (`release-lock.json`).

Owner preference: finish the complete delivery cycle, not just a feature branch.

1. Implement locally and run the relevant tests, build and regression checks.
2. Commit and push the topic branch; merge reviewed/tested work into the canonical main branch through a Pull Request. Do not leave completed work only on an unmerged feature branch.
3. Deploy the exact committed canonical revision to the appropriate VPS using the existing guarded rollout, backups and rollback path.
4. Verify running revision/image identity, health and the user-visible scenario on the deployed application.
5. Record the exact Git/runtime versions and results. Clean up merged task branches and temporary worktrees only after preserving all unrelated work.

Routine deployment of completed, tested KINOSOTA fixes is authorized by the owner; do not repeatedly ask whether to finish these steps. Real blockers, destructive/data-changing operations beyond the task, missing access and security risks must still be surfaced rather than bypassed. Never disable security checks to make deployment pass.

A task is not complete at “pushed”, “candidate built” or “deployed” alone. Report partial state explicitly; never claim an unverified release is production-ready. Keep one unambiguous canonical release, preserve production data and unrelated local changes, and avoid creating unexplained branches or commits.
