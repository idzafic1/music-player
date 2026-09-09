# API Spec

Base URL: `http://<backend-host>:<port>/api`. All bodies are JSON unless noted.
All list endpoints support `?limit=` and `?offset=` (defaults: limit=50, offset=0).

## Auth

Single-user app — no login. Optional: if the backend is ever reachable outside
localhost/LAN, require a static bearer token via `Authorization: Bearer <token>`
read from an env var (`API_TOKEN`). Implement this as one piece of middleware that
short-circuits when `API_TOKEN` is unset (LAN-only mode, no token required).

---

## Songs

- `GET /songs` — list local library. Query params: `q` (text search on title/artist),
  `genre`, `sort` (`title` | `added_at` | `play_count`).
- `GET /songs/:id` — full song detail, including genres, rating, favorite status,
  total play count.
- `GET /songs/:id/stream` — streams the audio file. **Must support HTTP Range
  requests** (206 partial content) for seeking.
- `DELETE /songs/:id` — removes the DB row and deletes the local file + thumbnail.
- `PATCH /songs/:id` — edit metadata (title, artist, genres).

## Downloading

- `POST /downloads` — body: `{ "url": string }` or `{ "query": string }`. Kicks off
  a download job (see `DOWNLOADER_SERVICE.md`). Returns a job id immediately;
  downloading happens async.
- `GET /downloads/:jobId` — poll job status: `pending | downloading | tagging | done | failed`,
  plus the resulting `song_id` once done.
- `POST /downloads/youtube-playlist` — body: `{ "url": string, "playlistName"?: string }`.
  Imports an entire YouTube playlist: creates a `playlists` row and downloads each
  video as a song. Returns a job id; poll `GET /downloads/:jobId` for aggregate
  progress (`completedCount` / `totalCount`).

## Online search (YouTube Music passthrough)

- `GET /search/online?q=` — only meaningful when the backend has internet access.
  Returns lightweight results: `{ sourceId, title, artistName, thumbnailUrl, durationSec }[]`.
  These are **not** downloaded yet — the client offers a "download" action per result
  which calls `POST /downloads` with that video's URL.

## Artists

- `GET /artists` — list, with song counts.
- `GET /artists/:id` — detail + their songs.

## Playlists

- `GET /playlists`
- `POST /playlists` — body: `{ "name": string, "description"?: string }`
- `GET /playlists/:id` — includes ordered songs
- `PATCH /playlists/:id` — rename/reorder. Body may include `{ "songOrder": string[] }`
  (array of song ids in new order).
- `DELETE /playlists/:id`
- `POST /playlists/:id/songs` — body: `{ "songId": string }` — append
- `DELETE /playlists/:id/songs/:songId` — remove from playlist

## Favorites

- `GET /favorites` — list favorited songs
- `PUT /favorites/:songId` — mark favorite (idempotent)
- `DELETE /favorites/:songId` — unmark

## Ratings

- `PUT /ratings/:songId` — body: `{ "stars": 1-5 }` — set/overwrite rating
- `DELETE /ratings/:songId` — clear rating

## Genres

- `GET /genres` — list all genres with song counts
- `PATCH /songs/:id/genres` — body: `{ "genreNames": string[] }` — replace a song's
  genre tags (creates any genre rows that don't exist yet)

## Play tracking

- `POST /plays` — body:
  ```json
  {
    "songId": "string",
    "secondsPlayed": 17,
    "sourceContext": "library"
  }
  ```
  **Client-side rule**: fire this exactly once per listening session, the moment
  cumulative playback time for that song reaches 15 seconds (not at song end — see
  `FRONTEND_APP.md` for the timer logic). The backend just inserts a `plays` row;
  it does not re-validate the 15s rule (trusts the client) but does sanity-check
  `secondsPlayed >= 15` and `secondsPlayed <= song.duration_sec` and 400s otherwise.

## Stats / Wrapped

- `GET /stats/wrapped?from=&to=` — Unix timestamps, defaults to last 365 days. Returns:
  ```json
  {
    "topSongs": [{ "songId": "...", "title": "...", "artistName": "...", "playCount": 42 }],
    "topArtists": [{ "artistId": "...", "name": "...", "playCount": 120 }],
    "topGenres": [{ "genre": "moody", "playCount": 88 }],
    "totalQualifyingPlays": 512,
    "totalMinutesListened": 1830
  }
  ```
  Each `top*` array capped at 5 entries (per the user's "top 5 for everything" spec).

## Recommendations

- `GET /recommendations/daily` — returns the current cached batch (see
  `RECOMMENDATIONS_ENGINE.md`), each item `{ sourceId, title, artistName, thumbnailUrl, reason }`.
- `POST /recommendations/refresh` — manually trigger regeneration (normally runs on
  a daily cron; this is for testing/manual refresh from settings).
- `GET /recommendations/genre/:genreName` — mood/genre-based picks, e.g.
  `/recommendations/genre/moody`. Same shape as daily.

## Settings

- `GET /settings`
- `PATCH /settings` — body is a flat key/value object, upserted into the `settings` table.

## Errors

Standard shape for all non-2xx responses:
```json
{ "error": { "code": "SONG_NOT_FOUND", "message": "human readable" } }
```
