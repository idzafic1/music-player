# QA Engineer Brief for Test Implementation

Use this document as the starting prompt for a test-writing agent.

## Objective

Implement a focused, high-value test suite for the personal music player project. The goal is to protect the core backend API, the downloader and playlist flows, the playback timing rules, and the frontend audio/state seams described in the product docs.

This is a single-user music app. Do not add auth, accounts, or multi-tenant test cases. Keep all tests aligned with the docs in this repository.

## Source of truth

Read these files before writing tests:

- [GEMINI.md](../GEMINI.md)
- [docs/README.md](README.md)
- [docs/ARCHITECTURE.md](ARCHITECTURE.md)
- [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md)
- [docs/API_SPEC.md](API_SPEC.md)
- [docs/DOWNLOADER_SERVICE.md](DOWNLOADER_SERVICE.md)
- [docs/RECOMMENDATIONS_ENGINE.md](RECOMMENDATIONS_ENGINE.md)
- [docs/FRONTEND_APP.md](FRONTEND_APP.md)
- [docs/STABILIZATION_AND_RESILIENCE.md](STABILIZATION_AND_RESILIENCE.md)
- [docs/AUDIO_QUALITY_IMPROVEMENTS.md](AUDIO_QUALITY_IMPROVEMENTS.md)
- [docs/TASKS_ROADMAP.md](TASKS_ROADMAP.md)

Important note: [GEMINI.md](../GEMINI.md) references [docs/UI_DESIGN.md](UI_DESIGN.md), but that file is not present in the workspace. Do not block on it. If UI assertions are needed, use the actual frontend code and the existing frontend docs.

## Repository context

- Backend test command: `npm run test` from [backend/package.json](../backend/package.json)
- Root test command: `npm test` from [package.json](../package.json)
- Existing backend test entry point: [backend/test/api.test.ts](../backend/test/api.test.ts)
- Backend uses Fastify, SQLite, and static file serving.
- Frontend uses Expo Router, Zustand, and a cross-platform audio abstraction.

## What to prioritize

Focus on the highest-risk behavior first:

1. Backend API contract coverage for the routes defined in [docs/API_SPEC.md](API_SPEC.md).
2. SQLite-backed schema behavior from [docs/DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).
3. Audio streaming behavior, especially HTTP Range support.
4. Download job lifecycle and playlist import behavior.
5. Play tracking and wrapped-stat calculations.
6. Recommendations generation and retrieval.
7. Frontend audio-engine logic, especially the 15-second qualifying-play timer and online/offline branching.
8. Resilience requirements from [docs/STABILIZATION_AND_RESILIENCE.md](STABILIZATION_AND_RESILIENCE.md).

## Recommended test slices

### Backend API tests

Add or expand tests for:

- `GET /health` and `GET /api/health`
- `GET /songs`, `GET /songs/:id`, `GET /songs/:id/stream`
- `PATCH /songs/:id`, `PATCH /songs/:id/genres`, `DELETE /songs/:id`
- `GET /artists`, `GET /artists/:id`
- `GET /playlists`, `POST /playlists`, `GET /playlists/:id`, `PATCH /playlists/:id`, `DELETE /playlists/:id`
- `POST /playlists/:id/songs`, `DELETE /playlists/:id/songs/:songId`
- `GET /favorites`, `PUT /favorites/:songId`, `DELETE /favorites/:songId`
- `PUT /ratings/:songId`, `DELETE /ratings/:songId`
- `GET /genres`
- `POST /plays`, `GET /stats/wrapped`
- `GET /settings`, `PATCH /settings`
- `POST /downloads`, `GET /downloads/:jobId`, `POST /downloads/youtube-playlist`
- `GET /search/online`
- `GET /recommendations/daily`, `POST /recommendations/refresh`, `GET /recommendations/genre/:genreName`

### Backend behavior worth testing explicitly

- Range requests return `206 Partial Content` and correct `Content-Range` / `Content-Length` headers.
- Song deletion removes associated local file and thumbnail path behavior.
- Duplicate source IDs are de-duped at the storage layer.
- Invalid play submissions are rejected when `secondsPlayed < 15` or exceed duration.
- Playlist ordering is preserved after reorder operations.
- Wrapped stats cap results at 5 entries per category.
- Recommendation results are not already-owned library tracks.

### Downloader and resilience tests

- Single-song download job states move through `pending`, `downloading`, `tagging`, `done`, or `failed`.
- Playlist imports continue on partial failures rather than aborting the whole batch.
- Download jobs persist in SQLite rather than only in memory if the implementation already supports it.
- Startup recovery behavior for interrupted jobs is covered if the code path exists.
- Sequential download processing is enforced, not parallel fan-out.

### Frontend tests

If the frontend already has a test harness or can support one cleanly, target these behaviors:

- The audio engine abstraction is the only playback entry point.
- The 15-second play timer fires once per listening session per song.
- Pause/resume does not reset qualifying-play accumulation.
- Loading the next song resets the timer.
- Online search UI is hidden or disabled when offline.
- Ratings and favorites update optimistically and revert on failure.
- Playlist import progress UI polls job status correctly.

## Suggested test organization

Use a layered approach:

1. Backend integration tests for the HTTP API and SQLite-backed persistence.
2. Service-level tests for downloader, recommendations, streaming, and stats logic where direct function tests are cheaper than HTTP tests.
3. Frontend unit tests for the audio engine and store logic.
4. Minimal UI tests only for cross-screen behavior that is easy to regress.

## Guardrails

- Do not rewrite the whole app to satisfy tests.
- Keep tests deterministic and fast.
- Stub external systems such as yt-dlp, ffmpeg, YouTube Music search, and network-dependent logic.
- Prefer fixture-driven database setup over mocking persistence where the real SQLite behavior is important.
- Do not add auth tests beyond the optional bearer-token middleware described in [docs/API_SPEC.md](API_SPEC.md) unless the code already implements it.
- Match the documented schema exactly. If a test reveals a real schema mismatch, fix the docs and code together.

## Useful acceptance criteria for the test-writing agent

The test work is complete when:

- Core backend routes have coverage for both success and failure cases.
- HTTP Range support is tested directly.
- Play tracking and wrapped stats are tested against real SQLite rows.
- Download and playlist-import state transitions are tested.
- Frontend audio timing logic is covered at the abstraction layer.
- The new tests run from the repository’s documented test command without manual steps.

## Suggested execution prompt for the next agent

> Read the docs listed in this file, then inspect the backend and frontend code. Add the smallest useful test suite that protects the API contract, downloader flows, playback timing, and wrapped-stat behavior. Stub external services, use SQLite-backed fixtures where appropriate, and keep the tests deterministic. Start with backend coverage if the frontend test harness is not yet present. When you finish, report what is covered, what remains untested, and any code or doc gaps you found.
