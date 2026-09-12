# Home & Library Polish

Five issues, found by reading the current code, plus one intentional redesign
of the Home screen's sections.

---

## 1. Replace the "Live preview" text with a checkmark badge

**Current**: `frontend/src/components/FullPlayerModal.tsx` shows a text caption
under the scrub bar whenever `currentSong.source === 'online'`:
`"Live preview — download to save & enable seeking"`.

**Fix**: remove that `<Text style={styles.livePreviewNotice}>` block entirely.
Replace it with a small badge overlaid on the corner of the artwork —
reusing the exact icon convention `SongListItem.tsx` already uses for
downloaded songs (`Ionicons name="checkmark-circle"` in `Colors.primary`,
line ~89): hollow/outline when not downloaded, filled when it is.

```tsx
// In the artworkContainer, as a sibling to the <Image>/placeholder:
<View style={styles.downloadBadge}>
  <Ionicons
    name={currentSong.source === 'online' ? 'checkmark-circle-outline' : 'checkmark-circle'}
    size={22}
    color={currentSong.source === 'online' ? Colors.textMuted : Colors.primary}
  />
</View>
```

```ts
downloadBadge: {
  position: 'absolute',
  top: 10,
  right: 10,
  backgroundColor: 'rgba(0,0,0,0.5)',
  borderRadius: 12,
  padding: 2,
},
```

Same convention applies anywhere else a "is this saved or just streaming"
question comes up (e.g. `MiniPlayer.tsx`'s thumbnail) — hollow outline =
not saved to device, filled = saved. Keep it silent/iconographic, no caption
text needed anywhere.

---

## 2. Genre chips show garbage ("Icarus ()", "Đorđe ()", "197 ()", "21 ()")

Two separate bugs stacked on top of each other:

**Bug A — bogus genre source data.** In
`backend/src/services/downloader.ts` (~line 370), every downloaded song blindly
ingests YouTube's raw `tags` metadata field as if it were genres:

```ts
if (Array.isArray(meta.tags)) {
  for (const tag of meta.tags.slice(0, 5)) {
    if (tag && tag.length < 25 && !tag.includes('http')) {
      genresToInsert.push(tag);
    }
  }
}
```

YouTube video `tags` are uncontrolled SEO keywords the uploader typed in —
collaborator names, random words, year fragments, anything. They are not a
genre taxonomy. That's exactly why "Icarus" and "Đorđe" (clearly
artist/collaborator names) and "197"/"21" (meaningless numbers) ended up as
"genres."

**Fix**: delete that whole `if (Array.isArray(meta.tags))` block. Leave the
`meta.categories` check above it (harmless — it's usually just "Music" and
already filtered out, so it rarely inserts anything, which is fine). Going
forward, genres are populated ONLY by explicit user action via the existing
`PATCH /songs/:id/genres` endpoint — there is no reliable automatic source for
real genre/mood tags from YouTube, so don't try to guess.

**Bug B — songCount always blank.** In `backend/src/services/library.ts`,
`listGenres()`'s SQL aliases the count as `song_count` (snake_case), but the
function returns the raw row cast `as any[]` with no mapping to `songCount`
(camelCase) — so `g.songCount` is always `undefined` on the frontend, which is
why every chip renders as "Name ()" with nothing between the parens.

**Fix**:

```ts
export function listGenres(): { id: string; name: string; songCount: number }[] {
  const db = getDb();
  const query = `
    SELECT g.id, g.name, COUNT(sg.song_id) AS song_count
    FROM genres g
    LEFT JOIN song_genres sg ON sg.genre_id = g.id
    GROUP BY g.id
    ORDER BY song_count DESC, g.name ASC
  `;
  const rows = db.prepare(query).all() as any[];
  return rows.map(r => ({ id: r.id, name: r.name, songCount: r.song_count }));
}
```

**One-time cleanup of existing garbage data**: since every existing genre row
came from the now-removed bad auto-tagging, wipe them rather than trying to
sort good from bad — nothing of value is lost, and the user can re-tag
manually going forward:

```sql
DELETE FROM song_genres;
DELETE FROM genres;
```

Run this once against `backend/data/*.db` (or via a small one-off script using
the existing `getDb()` connection) after deploying the code fix above, so the
chip row starts clean instead of showing the leftover garbage until re-tagged.

---

## 3. Make genre chips visually richer with a thumbnail

**Ask**: the chips are currently plain text pills — add a small representative
thumbnail to each so the row feels less bare (this matters more now that genre
chips will actually contain real, deliberately-tagged genres instead of noise).

**Backend**: extend `listGenres()` to include one sample thumbnail per genre
(the most recently added song carrying that tag):

```ts
export function listGenres(): { id: string; name: string; songCount: number; sampleThumbnailUrl: string | null }[] {
  const db = getDb();
  const query = `
    SELECT
      g.id, g.name, COUNT(sg.song_id) AS song_count,
      (
        SELECT s.thumbnail_path FROM songs s
        JOIN song_genres sg2 ON sg2.song_id = s.id
        WHERE sg2.genre_id = g.id
        ORDER BY s.added_at DESC LIMIT 1
      ) AS sample_thumbnail_path
    FROM genres g
    LEFT JOIN song_genres sg ON sg.genre_id = g.id
    GROUP BY g.id
    ORDER BY song_count DESC, g.name ASC
  `;
  const rows = db.prepare(query).all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    songCount: r.song_count,
    sampleThumbnailUrl: r.sample_thumbnail_path ? `/thumbnails/${r.sample_thumbnail_path.split('/').pop()}` : null
  }));
}
```

**Frontend** (`frontend/src/components/GenreChips.tsx`): render a small 20px
circular `expo-image` before the chip text when `sampleThumbnailUrl` exists,
falling back to the current text-only look when it doesn't:

```tsx
{g.sampleThumbnailUrl && (
  <Image source={{ uri: getFullThumbnailUrl(g.sampleThumbnailUrl) }} style={styles.chipThumb} />
)}
<Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
  {g.name} ({g.songCount})
</Text>
```

```ts
chipThumb: {
  width: 20,
  height: 20,
  borderRadius: 10,
  marginRight: 6,
},
```

(Update the `Genre` interface in `frontend/src/services/api.ts` to include
`sampleThumbnailUrl: string | null`.)

---

## 4. Sort shouldn't force a permanent selection, and "Downloaded" isn't a sort option

**Current**: `frontend/src/app/(tabs)/library.tsx`'s `sortRow` mixes three real
sort criteria (Recent/Title/Most Played — a mandatory single-select, always
exactly one highlighted) with a `showDownloadedOnly` boolean toggle rendered
as if it were a fourth sort pill. Two separate problems: sort can never be
"off," and a filter is visually presented as a sort option.

**Fix part 1 — let sort be deselected**, mirroring the toggle-off pattern
`GenreChips.tsx` already uses (tapping the active genre again clears it to
"All"). Apply the same idea here: tapping the currently-active sort pill again
clears it back to a silent default (no pill highlighted), rather than forcing
one to always stay lit:

```tsx
const [sort, setSort] = useState<'added_at' | 'title' | 'play_count' | null>('added_at');

// in the sort pill onPress:
onPress={() => setSort(sort === st ? null : st)}

// when calling the API, fall back to a default ordering when sort is null:
api.getSongs({ ..., sort: sort || undefined })
```

(Backend already defaults to `ORDER BY s.added_at DESC` when no `sort` param
is passed — see `listSongs()` in `library.ts` — so passing `undefined` is
already handled correctly, no backend change needed here.)

**Fix part 2 — separate "Downloaded" from the sort row entirely.** Move it out
of `sortRow` into its own small filter row directly under the genre chips
(or merge it into that same horizontal scroll as a non-genre chip, visually
distinguished with the cloud icon it already has) so it reads as a filter,
not a sort criterion. Simplest: give it its own single-item row:

```tsx
<View style={styles.filterRow}>
  <TouchableOpacity
    style={[styles.filterPill, showDownloadedOnly && styles.filterPillActive]}
    onPress={() => setShowDownloadedOnly(v => !v)}
  >
    <Ionicons
      name={showDownloadedOnly ? 'cloud-done' : 'cloud-download-outline'}
      size={14}
      color={showDownloadedOnly ? Colors.primary : Colors.textSecondary}
    />
    <Text style={[styles.filterPillText, showDownloadedOnly && styles.filterPillTextActive]}>
      Downloaded only
    </Text>
  </TouchableOpacity>
</View>
```

Style it distinctly enough from the `sortPill`/`chip` styles (e.g. a slightly
different border or a small cloud-icon accent already gives it a different
visual identity) that it doesn't read as "a 4th sort choice."

---

## 5. Daily Recommendations should be playable on tap, not just downloadable

**Current**: `frontend/src/app/(tabs)/index.tsx`'s recommendation cards only
have the "Get" download pill (`handleDownloadRecommendation`) — tapping the
card itself does nothing.

**Fix**: reuse the exact same live-preview streaming approach already built
for the Search tab (the `source: 'online'` synthetic `Song` + the
`/api/search/online/stream` backend endpoint from `docs/UI_AND_STREAMING_FIXES.md`).
Wrap the card's thumbnail/title area in a `TouchableOpacity` that plays it:

```tsx
const handlePlayRecommendation = (item: RecommendationItem) => {
  const previewSong: Song = {
    id: `preview-${item.sourceId}`,
    title: item.title,
    artistId: null,
    artistName: item.artistName,
    durationSec: 0,
    filePath: '',
    thumbnailPath: null,
    thumbnailUrl: item.thumbnailUrl,
    streamUrl: `${getApiBaseUrl()}/api/search/online/stream?url=${encodeURIComponent(item.sourceUrl)}`,
    source: 'online',
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    addedAt: 0,
    genres: [],
    rating: null,
    isFavorite: false,
    playCount: 0,
  };
  playSong(previewSong, [], 'recommendation');
};
```

Wrap the existing recommendation card's thumbnail/title/artist block (leave
the "Get" pill's own `onPress` untouched so downloading still works
independently) with `onPress={() => handlePlayRecommendation(item)}`.

---

## 6. Home screen redesign

**Current sections**: Daily Recommendations, Favorites (top 5), Recently Added
(last 10 downloaded, by `added_at`).

**Target sections, in this order**: Daily Recommendations (now tap-to-play per
#5 above) → **My Playlists** (new) → **Recently Played** (new, last 10 songs
by actual listening activity) → Favorites (kept, unchanged, moved to last).
Remove **Recently Added** entirely — it wasn't a useful signal, actual
listening history and playlists are more relevant on a home screen.

**Backend — new "recently played" query.** Add to
`backend/src/services/library.ts`, reusing the existing `formatSongRow` helper
so the shape matches every other song list in the app:

```ts
export function getRecentlyPlayedSongs(limit = 10): SongDetail[] {
  const db = getDb();
  const query = `
    SELECT
      s.*,
      a.name AS artist_name,
      r.stars AS rating_stars,
      (f.song_id IS NOT NULL) AS is_favorite,
      (SELECT COUNT(*) FROM plays p2 WHERE p2.song_id = s.id) AS play_count,
      (
        SELECT GROUP_CONCAT(g.name, ',')
        FROM song_genres sg
        JOIN genres g ON g.id = sg.genre_id
        WHERE sg.song_id = s.id
      ) AS genre_names,
      lastPlay.last_played_at
    FROM songs s
    JOIN (
      SELECT song_id, MAX(played_at) AS last_played_at
      FROM plays
      GROUP BY song_id
    ) lastPlay ON lastPlay.song_id = s.id
    LEFT JOIN artists a ON a.id = s.artist_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN favorites f ON f.song_id = s.id
    ORDER BY lastPlay.last_played_at DESC
    LIMIT ?
  `;
  const rows = db.prepare(query).all(limit);
  return rows.map(formatSongRow);
}
```

New route in `backend/src/routes/plays.ts` (add alongside the existing
`POST /api/plays` handler in the same `playRoutes` function):

```ts
fastify.get('/api/plays/recent', async (request: FastifyRequest<{
  Querystring: { limit?: string }
}>) => {
  const limit = request.query.limit ? parseInt(request.query.limit, 10) : 10;
  return getRecentlyPlayedSongs(Math.max(1, Math.min(limit, 50)));
});
```

(Import `getRecentlyPlayedSongs` from `../services/library.js` at the top of
`plays.ts`.)

**Frontend — `frontend/src/services/api.ts`**: add alongside the other
methods:

```ts
getRecentlyPlayed: (limit = 10) => request<Song[]>(`/api/plays/recent?limit=${limit}`),
```

**Frontend — `frontend/src/app/(tabs)/index.tsx`**:
- Delete the "Recently Added" section and its `recentSongs` state/fetch
  (`api.getSongs({ sort: 'added_at', limit: 10 })`).
- Add a `playlists` state, fetched via `api.getPlaylists()`, rendered as a
  horizontal scroll of playlist cards (same visual pattern as the existing
  recommendation cards — thumbnail collage or first-song art, name, song
  count), each tapping through to `router.push(\`/playlist/\${pl.id}\`)`.
- Add a `recentlyPlayed` state, fetched via `api.getRecentlyPlayed(10)`,
  rendered with the existing `SongListItem` component exactly like the
  Favorites section already does.
- Reorder the JSX so sections render: Recommendations → My Playlists →
  Recently Played → Favorites.
- Fetch all of these together in the existing `Promise.allSettled([...])` call
  in `loadData()` so one failing section doesn't block the others.

---

## Testing checklist

1. Play an undownloaded online/recommendation track: confirm the artwork shows
   a hollow checkmark badge and there's no text caption anywhere. Download it,
   play again: confirm the badge is now filled/solid.
2. Confirm genre chips show real counts (e.g. "Chill (3)") with no bare "()" —
   and confirm the bogus entries (artist names, bare numbers) are gone after
   the cleanup DELETE runs.
3. Confirm each genre chip shows a small round thumbnail.
4. Tap a sort pill twice: confirm the second tap clears the highlight and the
   list falls back to default order, rather than being stuck always-selected.
   Confirm "Downloaded only" now sits visually separate from the sort pills.
5. Tap directly on a Daily Recommendation card (not the "Get" pill): confirm
   it starts playing within a couple seconds. Confirm the "Get" pill still
   works independently for downloading the same item.
6. Confirm Home now shows, in order: Daily Recommendations, My Playlists,
   Recently Played, Favorites — and no "Recently Added" section anywhere.
   Play a couple of songs, pull to refresh Home, confirm they appear in
   Recently Played.
