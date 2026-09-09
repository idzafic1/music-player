# Recommendations Engine

Two related but distinct features:

1. **Daily recommendations** — "because you listen to X" style, refreshed once a day.
2. **Genre/mood-based recommendations** — on-demand, e.g. "give me moody/depressive
   songs" — doesn't need the daily job, just a search filtered by genre.

Both reuse the same underlying lookup: query YouTube Music for tracks similar to a
seed (artist, song, or genre/mood keyword), and store lightweight results (not
downloaded audio) for the client to browse and optionally download.

## Daily job (cron, runs once/day)

Implement with `node-cron` inside the backend process (no separate worker needed at
this scale). Suggested schedule: once daily, e.g. 6am local time.

**Algorithm:**

1. Pull the last 30 days of `plays`, joined to `songs`/`artists`/`genres`.
2. Compute:
   - Top 5 artists by play count
   - Top 3 genres by play count
   - A handful of individual top songs (for "more like this song" style seeds)
3. For each seed (artist name, or top song title+artist), call the YouTube Music
   search/related-tracks lookup (see "YouTube Music access" below) to fetch a small
   number of similar tracks (e.g. 5 per seed).
4. De-duplicate against songs already in the local library (`songs.source_id`) —
   don't recommend what's already owned.
5. Cap the final batch (e.g. 20-30 items total across all seeds) and write to the
   `recommendations` table, each row tagged with a human-readable `reason` (e.g.
   `"because you listen to Bonobo"`, `"more like Nightcall"`).
6. Clear out the previous day's batch (`DELETE FROM recommendations` before
   inserting the new one, or keep a `generated_at` and have the API only return the
   most recent batch — simplest is just wiping and re-inserting daily).

## Genre/mood-based recommendations (on demand)

`GET /recommendations/genre/:genreName` (see `API_SPEC.md`):

1. Look at songs in the local library tagged with that genre (if any) to use as
   search seeds; if none exist yet, just search YouTube Music directly using the
   genre/mood name as a query (e.g. `"depressive moody songs playlist"`,
   `"sad lo-fi mix"`).
2. Return results in the same shape as daily recommendations, `reason` set to
   something like `"tagged: moody"`.
3. This does **not** need to be cached/scheduled — compute it live on request,
   since it's user-initiated and infrequent.

## YouTube Music access

There's no official public YouTube Music API. Two practical options for an agent
to implement against, in order of preference:

- **`ytmusicapi`-equivalent approach**: use `yt-dlp`'s YouTube Music search support
  (`ytsearch:` with `music.youtube.com` extractor args) or a maintained Node
  library that talks to YouTube Music's internal endpoints, for both the "similar
  tracks" lookup and the online search feature in `API_SPEC.md`.
- **Fallback**: plain YouTube search via `yt-dlp` (`ytsearch5:<query>`) when a
  music-specific lookup isn't available — noisier results (more non-music videos)
  but works everywhere yt-dlp works.

Whichever library is chosen, isolate it behind a single internal module (e.g.
`services/youtubeMusic.ts`) with two functions — `search(query)` and
`getSimilar(seedTitle, seedArtist)` — so swapping the underlying implementation
later doesn't ripple through the recommendations job or the search endpoint.

## Notes

- The recommendations table only ever holds **not-yet-downloaded** tracks
  (`source_id` + `source_url`, no local `file_path`). Turning a recommendation
  into a real library song is just calling `POST /downloads` with its URL — no
  separate "convert recommendation to song" endpoint needed.
- If the daily job runs while the backend is offline (laptop asleep, etc.), have
  it also run once on server startup if the last `generated_at` is >24h old, so
  recommendations don't go stale for days at a time.
