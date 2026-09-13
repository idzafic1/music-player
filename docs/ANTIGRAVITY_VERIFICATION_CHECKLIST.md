# Antigravity Verification and Evidence Checklist

Use this checklist for every future implementation item. A source diff,
successful build, or visual inspection of code is not a substitute for runtime
evidence where this checklist requires it.

## 1. Before editing

- [ ] Run `git status --short`.
- [ ] Run `git log --oneline -10`.
- [ ] Confirm no user changes will be discarded.
- [ ] Read `docs/AGENTIC_PRODUCT_MASTER_SPEC.md`.
- [ ] Read the owning scoped docs and search all `docs/` files for conflicting
      rules.
- [ ] Read applicable `.agents/skills/*/SKILL.md` files.
- [ ] Identify the nearest owning module and existing tests.
- [ ] Write one falsifiable hypothesis and one cheap disproof check.
- [ ] Confirm the work is not already implemented.
- [ ] Confirm the work is one feature-opportunity item, not a batch.

## 2. Backend verification

Run:

```bash
npm --prefix backend run build
npm --prefix backend test
```

For backend-affecting changes, verify the relevant subset of:

- [ ] Health endpoint succeeds.
- [ ] JSON error shape is preserved.
- [ ] Songs list/detail/update/delete behavior is correct.
- [ ] Pagination is bounded and offsets behave correctly.
- [ ] Library `sort=added_at` remains a normal uncapped browse mode.
- [ ] Dedicated Home recently-played endpoint remains bounded separately.
- [ ] Range requests return correct `206`, `Content-Range`, and length data.
- [ ] Download jobs expose truthful state transitions and survive restart
      according to the durable-job design.
- [ ] Playlist import reports aggregate progress and partial failures.
- [ ] Recommendation results exclude owned source IDs and retain reasons.
- [ ] Recommendation replacement is transactional.
- [ ] Graceful shutdown closes Fastify and SQLite.
- [ ] No external process or network dependency is required for deterministic
      tests unless explicitly stubbed.

If a backend change alters an endpoint or schema:

- [ ] Update `docs/API_SPEC.md` or `docs/DATABASE_SCHEMA.md` in the same
      change.
- [ ] Check all other docs for the old contract.
- [ ] Do not proceed with an ambiguous migration without user authorization.

## 3. Frontend verification

Run:

```bash
npm --prefix frontend run build
npm --prefix frontend run lint
```

- [ ] Record the exact exit status.
- [ ] Separate pre-existing lint errors from errors introduced by the change.
- [ ] Do not add a new lint/test configuration merely to hide failures.
- [ ] Confirm async states distinguish loading, loaded, empty, retrying,
      unavailable, failed, succeeded, and cancelled where applicable.
- [ ] Confirm intervals, listeners, polling, and resumable downloads clean up.
- [ ] Confirm errors are visible and useful rather than converted to empty
      success-shaped data.
- [ ] Confirm stable song-identity keys.
- [ ] Confirm local URI playback does not contact the backend.
- [ ] Confirm non-downloaded playback fails visibly when the backend is absent.
- [ ] Confirm a previous song keeps its artwork after switching songs.

For visual/layout changes:

- [ ] Read `.agents/skills/visual-regression-loop/SKILL.md`.
- [ ] Read `.agents/skills/layout-safety/SKILL.md` if a row/card image is
      involved.
- [ ] Confirm images use bounded dimensions or
      `StyleSheet.absoluteFillObject`; never unresolved percentage height in an
      auto-height row.
- [ ] Confirm thumbnails touch the intended card/row edges and are clipped by
      the outer container.
- [ ] Confirm text/action padding does not wrap or shrink the thumbnail.

## 4. Android build and launch

Check the target:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
adb devices -l
```

- [ ] Target appears as `device`, not `offline` or `unauthorized`.
- [ ] Start Metro using the repository's documented Expo command.
- [ ] Confirm Metro is actually listening before launching.
- [ ] Reverse required ports:

```bash
adb -s <device> reverse tcp:8081 tcp:8081
adb -s <device> reverse tcp:3001 tcp:3001
```

- [ ] Build:

```bash
cd frontend/android
./gradlew assembleDebug --quiet
```

- [ ] Install the exact APK built by that command.
- [ ] Force-stop and relaunch the app.
- [ ] Wait for the app to render; do not use a splash screen as proof of a
      loaded screen.

## 5. Required visual regression loop

Use the exact affected screen and navigation path.

Before:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"
A="$ANDROID_HOME/platform-tools/adb -s <device>"
$A exec-out screencap -p > /tmp/before-<screen>.png
```

Then:

1. Make the smallest coherent code change.
2. Rebuild and reinstall.
3. Relaunch the app.
4. Navigate to the same screen and state.
5. Capture:

```bash
sleep 3
$A exec-out screencap -p > /tmp/after-<screen>.png
```

6. Actually inspect both files, not just their existence.
7. Record the screenshot paths in the final report.

Inspect specifically for:

- [ ] No row/card height expansion.
- [ ] No stretched, missing, or non-edge-to-edge artwork.
- [ ] No text clipping or action overlap.
- [ ] No chip overflow that hides the primary interaction.
- [ ] No stale loading indicator.
- [ ] Download progress and cancellation states are legible.
- [ ] Offline/stale snapshot state is distinguishable from fresh state.
- [ ] Empty/error/unavailable states are intentional and non-deceptive.
- [ ] Narrow-phone layout remains usable.

## 6. Logcat evidence

After exercising the changed behavior:

```bash
adb -s <device> logcat -d -t 300 | \
  grep -E 'FATAL EXCEPTION|AndroidRuntime|com.spiki.personalmusic|ReactNativeJS'
```

- [ ] Review the output, not only the command exit code.
- [ ] No introduced fatal exception.
- [ ] No React Native error caused by the changed behavior.
- [ ] Record meaningful warnings if they affect the feature.
- [ ] Do not claim a clean runtime check when the app never reached the
      affected screen.

## 7. Offline and resilience scenarios

### Downloaded playback

- [ ] Download a song to the device.
- [ ] Observe progress at 0.
- [ ] Observe at least one intermediate progress value where practical.
- [ ] Confirm progress is monotonic.
- [ ] Confirm the index is written only after a complete file exists.
- [ ] Disable backend/network connectivity.
- [ ] Play the downloaded song.
- [ ] Confirm seek/pause controls continue to work.
- [ ] Confirm no backend request is needed for local playback.

### Non-downloaded playback

- [ ] With backend unavailable, attempt a song without a valid local URI.
- [ ] Confirm a visible recoverable error.
- [ ] Confirm no false downloaded badge or success state.

### Server-unavailable snapshot

- [ ] Load Home/Library/playlist data successfully once.
- [ ] Stop or disconnect the backend.
- [ ] Relaunch or force the unavailable state.
- [ ] Confirm last successful metadata remains visible if the feature claims
      persistence.
- [ ] Confirm stale/unavailable status is clear.
- [ ] Confirm backend mutations, online search, imports, and non-local
      streaming are disabled or explain their dependency.
- [ ] Restore connectivity and confirm refresh replaces stale data only after a
      successful response.

### Playlist download

- [ ] Start Download all on a non-empty playlist.
- [ ] Confirm duplicate downloads are not started for already-downloaded songs.
- [ ] Confirm aggregate completed/total and percentage are truthful.
- [ ] Cancel during an active transfer.
- [ ] Confirm the partial file is not indexed.
- [ ] Confirm the active download/listener/poller is cleaned up.
- [ ] Confirm already completed songs remain downloaded.
- [ ] Retry a failed item and confirm the error state clears only on success.

### Recommendations and mood

- [ ] Confirm Home shows refresh context when recommendations have a timestamp.
- [ ] Confirm mood explanation is derived from an explainable reason.
- [ ] Confirm owned library songs are excluded.
- [ ] Confirm each Search mood chip is compact, selectable, and debounced.
- [ ] Confirm chips are disabled or clearly unavailable offline.

## 8. Frontend test acceptance

When a frontend test harness exists or is added:

- [ ] Progress starts at exactly `0`.
- [ ] Progress values are clamped to `[0, 1]`.
- [ ] Progress never decreases.
- [ ] Progress reaches `1` only after completion and index persistence.
- [ ] Duplicate download requests are prevented.
- [ ] Cancellation removes temporary state and does not index partial files.
- [ ] Retry retains failures that still fail and clears successful failures.
- [ ] Playlist progress accounts for completed songs and current-song fraction.
- [ ] Song switching resets the qualifying-play accumulator.
- [ ] Pause/resume preserves cumulative qualifying-play time.
- [ ] Stale callbacks cannot overwrite the current song.
- [ ] Local URI resolution precedes explicit stream URL/backend-derived URL.

## 9. Commit and final report

- [ ] One coherent feature item per commit.
- [ ] Commit message identifies the behavior.
- [ ] Commit includes:

  `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`

- [ ] No `git push`.
- [ ] No reset/discard of unrelated changes.
- [ ] Worktree status is understood after commit.

Final report must include:

1. Commit hash and summary.
2. Files changed.
3. Commands run and outcomes.
4. Test cases added or exercised.
5. Screenshot paths and what was visually inspected.
6. Device/emulator identifier and logcat result.
7. Anything not verified and the concrete reason.
8. Documentation conflicts.
9. Remaining work or product decisions required.
