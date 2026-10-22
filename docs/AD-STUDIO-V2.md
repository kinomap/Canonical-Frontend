# Ad Studio v2

Two workspaces: campaign library with active switches and global rules, and a searchable
per-video timeline with direct Media Node preview, yellow draggable/keyboard markers,
quick semantic positions, revision-checked save and three-second transition testing.
Transition tests use preview URLs and never send impression/completion events.

Ad media is preloaded in a distinct hidden element after authenticated detail-page load;
there is no impression until actual playback. User intent starts that element while the
main playback URL/session is being resolved. Main URL arrival never restarts pre-roll.
The main video uses preload=auto during the ad; playback resumes at its preserved position.
Signed links are refreshed if prepared data is older than four minutes. Browser autoplay
restrictions still apply. Cold-network first-frame and zero-stall targets require measurement;
preload is a browser hint, not a guarantee of buffered duration.

Uploads use owner/scoped tickets and signed node receipts. The private admin CSP permits
connect-src only to the exact Media Node in addition to prior approved origins; media-src
remains restricted to that Node. No dependency was removed or upgraded.
