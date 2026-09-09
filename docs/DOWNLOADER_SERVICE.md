# Downloader Service

> **Note on scope**: downloading audio from YouTube for personal use sits in a
> legal/ToS gray area that varies by jurisdiction and by the specific content
> (e.g. licensed music vs. a creator's own upload). That's a call for the user to
> make, not something these docs weigh in on further — this file just specifies
> how the feature works, for personal-use software the user is building for
> themselves.

## Dependencies

- `yt-dlp` binary (shelled out to via `child_process.spawn`, not a raw HTTP scrape —
  it handles YouTube's changing internals and is actively maintained)
- `ffmpeg` for extracting/transcoding audio (yt-dlp can call this itself if
  `ffmpeg` is on PATH — prefer letting yt-dlp orchestrate it)
- `node-id3` (or similar) to write ID3 tags (title/artist/album art) onto the
  output file if yt-dlp's own embedding isn't sufficient
- Output audio format: **opus or m4a** (better quality/size than mp3 at same
  bitrate); pick one and be consistent. Recommendation: `m4a` for broadest device
  compatibility including Android native playback.

## Fedora setup notes

- `sudo dnf install ffmpeg` (may need the RPM Fusion repo enabled first, since
  Fedora's official repos ship a limited ffmpeg build without some codecs:
  `sudo dnf install https://download1.rpmfusion.org/free/fedora/rpmfusion-free-release-$(rpm -E %fedora).noarch.rpm`)
- `yt-dlp`: prefer installing via `pip install --user yt-dlp` or `pipx install yt-dlp`
  over the Fedora repo package, since yt-dlp changes frequently and the repo
  version lags behind YouTube's changes.

## Single-song download flow (`POST /downloads`)

1. Client sends a YouTube URL, or a text query.
2. If it's a query, resolve to a single video first (`yt-dlp "ytsearch1:<query>"
   --dump-json`, no download) so the job can report title/thumbnail immediately
   and de-dupe against `songs.source_id` before downloading.
3. Check `songs` table for an existing row with the same `source_id` — if found,
   skip download and return the existing song (avoid duplicate files).
4. Run yt-dlp to extract best audio, output to a temp path:
   ```
   yt-dlp -x --audio-format m4a --audio-quality 0 \
     --embed-thumbnail --add-metadata \
     -o "<tmp>/%(id)s.%(ext)s" "<url>"
   ```
5. Move finished file into the library's audio directory (e.g.
   `backend/data/audio/<song-id>.m4a`), extract/save the thumbnail separately to
   `backend/data/thumbnails/<song-id>.jpg` for the frontend to fetch cheaply.
6. Read duration from yt-dlp's JSON metadata (`--dump-json` output captured in
   step 2, or re-parsed post-download) and insert the `songs` row.
7. If yt-dlp/YouTube Music metadata includes genre/mood tags, write them to
   `song_genres`; otherwise leave ungenred until the user tags it manually.
8. Update the job status record so `GET /downloads/:jobId` reflects progress
   (`pending → downloading → tagging → done`, or `failed` with an error message).

Keep an in-memory (or SQLite-backed, for durability across restarts) job table —
simple map of `jobId -> { status, error?, songId? }` is enough; no queueing system
needed at this scale.

## Playlist import flow (`POST /downloads/youtube-playlist`)

1. Run `yt-dlp --flat-playlist --dump-json <playlist-url>` to enumerate videos
   without downloading anything yet — gives you the full list + count up front.
2. Create the `playlists` row (`source = 'youtube_import'`, `source_url` = the
   playlist URL).
3. For each video, run the single-song download flow above (reusing the de-dupe
   check so re-importing a playlist that shares songs with your library doesn't
   duplicate files), then insert a `playlist_songs` row with the correct
   `position`.
4. Track aggregate progress (`completedCount`/`totalCount`) on the job so the
   client can show a progress bar for a big playlist.
5. Continue on a per-video failure (private/deleted videos, region locks) rather
   than aborting the whole import — collect failures into the job's error list so
   the user can see which tracks didn't come through.

## Rate limiting / politeness

- Process downloads **sequentially**, one at a time (a simple in-process queue),
  rather than firing many `yt-dlp` processes in parallel — this is both kinder to
  YouTube and easier to reason about for progress reporting.
- Keep `yt-dlp` updated (it breaks periodically when YouTube changes things) —
  `pip install --user -U yt-dlp` / `pipx upgrade yt-dlp` periodically. Note this
  as an operational task in `TASKS_ROADMAP.md`, not something to hardcode a
  version pin against long-term.
