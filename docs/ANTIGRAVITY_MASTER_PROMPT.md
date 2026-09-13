# Antigravity CLI Master Prompt

Copy this entire prompt into the Antigravity CLI when asking another agent to
continue work on this repository.

---

You are working on `/home/spiki/music-player`, repository
`idzafic1/music-player`.

This is a single-user personal music player. It has a TypeScript/Fastify +
SQLite backend in `backend/` and an Expo Router React Native/web frontend in
`frontend/`. It downloads audio through `yt-dlp`/`ffmpeg`, serves the permanent
library from the backend, and supports Android, emulator, and web/PWA clients.
There are no accounts, profiles, social features, or multi-tenant requirements.

## Governing rules

Read these documents before changing code:

1. `docs/AGENTIC_PRODUCT_MASTER_SPEC.md` — the single governing product and
   engineering specification.
2. `docs/ARCHITECTURE.md`
3. `docs/DATABASE_SCHEMA.md`
4. `docs/API_SPEC.md`
5. `docs/DOWNLOADER_SERVICE.md`
6. `docs/RECOMMENDATIONS_ENGINE.md`
7. `docs/FRONTEND_APP.md`
8. `docs/OFFLINE_DOWNLOADS.md`
9. `docs/TASKS_ROADMAP.md`
10. `docs/ANTIGRAVITY_REMAINING_WORK.md`
11. `docs/ANTIGRAVITY_VERIFICATION_CHECKLIST.md`

Read every applicable skill under `.agents/skills/` before work. In particular:

- `doc-conflict-check`: search all `docs/` files for competing rules before
  treating any prose as authoritative.
- `layout-safety`: never use unresolved percentage image heights in an
  auto-height row; use the established absolute-fill pattern.
- `visual-regression-loop`: visual changes require before/rebuild/after
  screenshots, actual image inspection, and app-specific logcat review.
- `android-build-installer`: follow the repository's Android build/install
  procedure.
- `app-stabilizer` and `audio-pipeline-enhancer` only when the task touches
  their domains.

Source-of-truth precedence:

1. The newest explicit user requirement.
2. Runtime behavior and tests.
3. `docs/AGENTIC_PRODUCT_MASTER_SPEC.md`.
4. Scoped feature documents that do not contradict the master spec.
5. Older roadmap/prose documents.

If two documents actually contradict each other, stop and report the conflict.
Do not silently choose a convenient interpretation. Do not create a second
constitution document.

## Current state: do not duplicate this work

Inspect the actual source and git history before editing. The following work is
already present in committed history and must be treated as implemented, not
recreated:

- `e116788` — compact Calm, Melancholic, Cheerful, and Energetic mood chips on
  Search, wired to the existing debounced online search flow.
- `b46e47e` — playlist-level offline download controls with aggregate progress
  and cancellation.
- `ed3e8bd` — Settings offline storage count and total-byte summary.
- `a960147` — retained failed device downloads and a retry action.
- `7c9bb3d` — cloud/check semantics for downloaded state.
- `9377a87` — recommendation refresh date and active-mood explanation on Home.
- Earlier commits — durable backend download jobs, graceful shutdown, stream
  range support, offline storage, offline URI playback, stall handling, Home
  recently played, search previews, thumbnail/layout fixes, and library
  Recent-sort correction.

“Implemented” means source code exists. It does not mean the behavior has
passed Android verification. Confirm current source before changing it.

## Ordered remaining work

Work on one coherent item at a time. Never combine multiple feature-opportunity
items in one commit.

### 1. Server-unavailable mode with last successful library snapshot

The app must remain navigable when the backend cannot be reached. It may show a
last-known snapshot of library metadata and cached artwork, and it must still
play valid device-local downloads. It must not claim that mutations, online
search, server imports, or non-downloaded streaming succeeded.

Before implementing, inspect:

- `frontend/src/app/_layout.tsx`
- `frontend/src/store/settingsStore.ts`
- `frontend/src/app/(tabs)/index.tsx`
- `frontend/src/app/(tabs)/library.tsx`
- `frontend/src/app/playlist/[id].tsx`
- `frontend/src/services/api.ts`
- `frontend/src/services/offlineStorage.ts`
- existing AsyncStorage usage

Do not invent a server schema or silently turn failed API calls into empty
successful lists. Define the snapshot scope, freshness metadata, invalidation
rules, and disabled-action behavior in the implementation or stop for product
clarification if the choice affects ownership or schema.

### 2. Policy-aware background refresh

Any background refresh must respect actual connectivity and device/network
policy. It must not create duplicate requests, unbounded timers, or an
indefinite loading state. It must have cleanup on unmount/app lifecycle changes,
timeouts, visible error handling, and a clear rule for whether refresh is
allowed on metered networks or only when online.

Inspect the current NetInfo wiring, recommendation scheduler, Home loading
behavior, and all intervals before adding another refresh loop. Prefer existing
abstractions over a new global service.

### 3. Automated frontend tests

Add focused tests for:

- Progress starts at `0`, is monotonic, is clamped, and reaches `1` only after
  the file is indexed.
- Duplicate download prevention and cancellation cleanup.
- Playlist aggregate progress, partial completion, cancellation, and retry.
- Song switching resets qualifying-play state and stale callbacks cannot update
  the new song.
- Offline URI resolution prefers a valid local file and does not contact the
  backend when a local file exists.

First inspect whether a frontend test runner already exists. Do not add a large
framework migration merely to satisfy tests. If a small test dependency is
necessary, explain why and keep it isolated. Preserve the existing backend
test command and use deterministic mocks for filesystem, network, Track Player,
Howler, NetInfo, `yt-dlp`, and `ffmpeg`.

### 4. Hardening and verification of completed opportunity work

Only after the remaining feature behavior is clear, repair directly coupled
issues found in source or tests, such as stale async callbacks, cancellation
cleanup, misleading success states, unsafe row thumbnail sizing, or baseline
test gaps. Do not expand into unrelated polish.

## Required work protocol

Before each item:

1. Run `git status --short` and `git log --oneline -10`.
2. State one falsifiable hypothesis about the current behavior.
3. Name one cheap check that could disprove it.
4. Search all relevant docs for conflicts.
5. Inspect the nearest owning abstraction and current tests.
6. Check whether the item is already implemented.

During implementation:

- Make the smallest coherent change.
- Preserve public API shapes unless a planned migration is approved.
- Keep backend SQLite authoritative for permanent library metadata.
- Keep `offline_downloads_index` authoritative only for device-local files.
- Never add auth/accounts/multi-tenancy.
- Never use broad catches or silent success fallbacks.
- Never use `as any` to hide a type problem.
- Use absolute-fill image positioning for thumbnails inside auto-height rows.
- Clean every interval, listener, poller, and active download.
- Keep async state truthful: requested, active, succeeded, failed, and
  cancelled are different states.
- Update directly related docs when an API, schema, or product rule changes.

For every visual change, follow `.agents/skills/visual-regression-loop/SKILL.md`:

1. Capture the affected screen before editing.
2. Make the smallest change.
3. Build/reinstall the Android app.
4. Capture the same screen after the same navigation path.
5. Actually inspect both screenshots.
6. Check app-specific logcat for fatal exceptions.

Do not claim emulator/device verification without actual screenshot and logcat
evidence.

## Required validation

Run the smallest relevant checks, then the matrix checks when the item is
complete:

```bash
npm --prefix backend run build
npm --prefix backend test
npm --prefix frontend run build
npm --prefix frontend run lint
cd frontend/android && ./gradlew assembleDebug --quiet
```

The frontend lint command may expose existing baseline violations. Separate
pre-existing failures from regressions caused by your change; do not rewrite
unrelated screens just to make the command green. Report the exact files and
lines if lint remains non-zero.

For Android:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
adb devices -l
adb -s emulator-5554 reverse tcp:8081 tcp:8081
adb -s emulator-5554 reverse tcp:3001 tcp:3001
```

Verify Metro is listening before launching. The target must be `device`, not
`offline` or `unauthorized`.

## Commit rules

- One feature-opportunity item per commit.
- Use a clear imperative commit message.
- Include:

  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

- Never run `git push`.
- Never reset, discard, or overwrite user changes.

## Final report format

Report:

- Commit hash and exact behavior changed.
- Files changed.
- Backend/frontend commands and outcomes.
- Android device identifier, screenshots captured, and logcat result.
- Tests added and what they prove.
- Anything not verified and why.
- Documentation conflicts found.
- Remaining work, if any.

Stop and report instead of guessing when:

- Product behavior is ambiguous.
- A schema change is required but not explicitly authorized.
- Two governing documents conflict.
- Physical verification is required but no usable device/emulator exists.

Begin by reading the documents and inspecting the current source. Do not start
with a speculative rewrite.
