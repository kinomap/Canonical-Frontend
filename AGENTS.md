# KINOSOTA delivery workflow

Owner preference: finish the complete delivery cycle, not just a feature branch.

1. Implement locally and run the relevant tests, build and regression checks.
2. Commit and push to Git; merge reviewed/tested work into the canonical main branch. Do not leave completed work only on an unmerged feature branch.
3. Deploy the exact committed canonical revision to the appropriate VPS using the existing guarded rollout, backups and rollback path.
4. Verify running revision/image identity, health and the user-visible scenario on the deployed application.
5. Record the exact Git/runtime versions and results. Clean up merged task branches and temporary worktrees only after preserving all unrelated work.

Routine deployment of completed, tested KINOSOTA fixes is authorized by the owner; do not repeatedly ask whether to finish these steps. Real blockers, destructive/data-changing operations beyond the task, missing access and security risks must still be surfaced rather than bypassed. Never disable security checks to make deployment pass.

A task is not complete at “pushed”, “candidate built” or “deployed” alone. Report partial state explicitly; never claim an unverified release is production-ready. Keep one unambiguous canonical release, preserve production data and unrelated local changes, and avoid creating unexplained branches or commits.
