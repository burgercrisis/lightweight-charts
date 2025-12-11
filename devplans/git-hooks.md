---
description: fixing git commit failures caused by local git hooks
---

## Context
- **Repo**: lightweight-charts
- **Issue**: `git commit` fails due to a broken `pre-commit` hook that points to a non-existent `scripts/githooks` directory.
- **Current hooks**: `.git/hooks/pre-commit` was auto-generated previously and still references `E:/code/lightweight-charts/scripts/githooks/pre-commit`.
- **Archived scripts**: old hook installer and scripts now live under `archive/scripts/githooks`.

## Current state
- **package.json** still contains:
  - `postinstall`: runs `npm run install-hooks`.
  - `install-hooks`: runs `node scripts/githooks/install.js` (path no longer exists).
- `.git/hooks/pre-commit` contained logic to:
  - Look for `HOOK_DIR="E:/code/lightweight-charts/scripts/githooks/pre-commit"`.
  - Fail with non-zero status if that folder is missing.
- This failure can surface as `git commit` errors like "failed to execute git" or a hook failure.

## Change applied (local quick fix)
- **Goal**: unblock commits immediately without altering project sources.
- **Action**: modified local `.git/hooks/pre-commit` to exit successfully at the top of the script.
  - Added an early `exit 0` line at the top.
  - Left all existing comments and hook logic in place below it (effectively disabled).
- Result: `pre-commit` hook is now a no-op; `git commit` should no longer fail due to this hook.

## Future options
- **Option A (recommended)**: Rebuild a proper hook setup (if strict linting-on-commit is desired).
  - Create a real `scripts/githooks` tree from `archive/scripts/githooks`.
  - Update `package.json`:
    - Ensure `install-hooks` points at the restored `scripts/githooks/install.js`.
  - Adjust `.git/hooks/pre-commit` / installer so `HOOK_DIR` points to the new, real directory.
  - Ensure commands called inside hooks (e.g., `npm run tsc-verify`) are compatible with the chosen package manager (pnpm preferred).

- **Option B**: Keep hooks disabled for this clone.
  - Leave `.git/hooks/pre-commit` with early `exit 0`.
  - Optionally remove or comment out `postinstall`/`install-hooks` in `package.json` to avoid trying to re-install broken hooks in the future.

- **Option C**: Replace custom hooks with a modern hook manager (e.g., Husky) in a future refactor.
  - Add Husky (or similar) dev dependency.
  - Move lint/check logic from the old `archive/scripts/githooks/pre-commit/lint.js` into a normal npm script.
  - Wire `pre-commit` to run that script via Husky.

## Open questions / decisions
- Do we want strict lint/type-check on every commit in this repo, or only in CI?
- Should we standardize hook behavior around pnpm instead of npm?
- For contributors, should hooks be optional (documented) or auto-installed?
