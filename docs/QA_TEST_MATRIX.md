# QA Test Matrix

This matrix is a compact planning aid for a test-writing agent. Use it together with [QA_ENGINEER_BRIEF.md](QA_ENGINEER_BRIEF.md).

## Backend

| Area | What to verify | Priority |
|---|---|---|
| Health | `/health` and `/api/health` respond with success | High |
| Songs | list, detail, patch, delete, genres | High |
| Streaming | `GET /songs/:id/stream` supports HTTP Range | High |
| Artists | list and detail responses are correct | Medium |
| Playlists | create, reorder, add/remove song, delete | High |
| Favorites | idempotent add/remove and list behavior | High |
| Ratings | set, overwrite, clear, validation | High |
| Genres | list and song genre replacement | High |
| Plays | qualifying play validation and insertion | High |
| Wrapped stats | top-5 caps, time range handling | High |
| Settings | round-trip get/patch behavior | Medium |
| Downloads | job lifecycle, polling, playlist import progress | High |
| Search | online passthrough shape and offline handling | Medium |
| Recommendations | daily cache and genre query shapes | High |

## Frontend

| Area | What to verify | Priority |
|---|---|---|
| Audio engine | shared abstraction, no direct platform coupling | High |
| Qualifying play timer | 15-second rule, pause/resume, song switch reset | High |
| Offline state | online search hidden/disabled offline | Medium |
| Library state | list rendering and cached data flows | Medium |
| Player actions | seek, favorite, rating, queue controls | Medium |
| Playlist import | job progress polling and completion/error states | Medium |

## External dependencies to stub

- `yt-dlp`
- `ffmpeg`
- YouTube Music search / related-track lookups
- Network connectivity state
- Browser media/audio primitives if unit-testing the web audio engine

## Regression risks called out by the docs

- Download jobs lost on restart if only in memory.
- Range request regressions breaking scrubbing.
- The play counter firing too early, too late, or more than once.
- Recommendations surfacing songs already in the local library.
- Playlist import aborting the entire batch on one bad video.
- Frontend screens bypassing the audio abstraction and becoming platform-specific.
