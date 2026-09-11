# UI & Online-Streaming Fixes

Six issues found by reading the actual current code (not speculation). Fix in
the order listed — 1 and 2 are trivial and safe to batch together, 3 is a
one-file backend fix, 4 and 5 are the real feature work, 6 is a small nav change.

---

## 1. Content renders under the status bar

**Root cause**: `SafeAreaView` (from `react-native-safe-area-context`) is used
correctly on every screen, but `SafeAreaProvider` — the component that actually
measures and supplies real inset values — is never mounted anywhere. Without
it, insets fall back to near-zero on Android, which is why "WELCOME BACK / Your
Music" renders almost flush against the system status bar.

**Fix**: in `frontend/src/app/_layout.tsx`, wrap the whole tree:

```tsx
import { SafeAreaProvider } from 'react-native-safe-area-context';

// ...
return (
  <SafeAreaProvider>
    <StatusBar style="light" />
    <Stack /* ...existing props... */>
      {/* ...existing screens... */}
    </Stack>
    <FullPlayerModal />
  </SafeAreaProvider>
);
```

This is a one-file change and should fix the cramped-header look on every
screen at once, not just Home.

---

## 2. Repeat icon doesn't visually distinguish "repeat one" from "repeat all"

**Root cause**: `frontend/src/components/FullPlayerModal.tsx`, around line 254:

```tsx
name={repeatMode === 'one' ? 'repeat' : 'repeat'}
```

Both branches resolve to the same Ionicons name — a straight copy-paste bug.
There is currently no way to visually tell the two modes apart, which is
exactly the ambiguity you ran into.

**Fix**: Ionicons doesn't have a "repeat-one" glyph, but `@expo/vector-icons`'s
MaterialIcons set does. Swap icon families based on mode:

```tsx
import { Ionicons, MaterialIcons } from '@expo/vector-icons';

// ...inside the repeat button...
{repeatMode === 'one' ? (
  <MaterialIcons name="repeat-one" size={24} color={Colors.primary} />
) : (
  <Ionicons
    name="repeat"
    size={24}
    color={repeatMode === 'all' ? Colors.primary : Colors.textMuted}
  />
)}
```

Three visibly distinct states: off (muted, plain repeat icon), all (primary
color, plain repeat icon), one (primary color, repeat-one icon with the "1"
baked into the glyph).

---

## 3. Daily recommendations show songs you've already downloaded

**Root cause**: `backend/src/services/recommendations.ts`'s
`refreshDailyRecommendations()` dedupes against your library correctly, but
only at generation time — it runs once a day (cron) or once on server startup
if stale. `getDailyRecommendations()` (the read path the frontend actually
calls) just returns whatever rows are sitting in the `recommendations` table,
with no re-check against the current library. Download a recommended song and
it keeps showing as a recommendation until the next scheduled refresh, up to
24 hours later.

**Fix**: filter at read time, not just at generation time. In
`backend/src/services/recommendations.ts`:

```ts
export function getDailyRecommendations(): RecommendationItem[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.* FROM recommendations r
    WHERE r.source_id NOT IN (
      SELECT source_id FROM songs WHERE source_id IS NOT NULL
    )
    ORDER BY generated_at DESC, rowid ASC
  `).all() as any[];

  return rows.map(r => ({ /* ...unchanged mapping... */ }));
}
```

Also, for instant removal (not just "filtered on next fetch"): in whichever
part of `backend/src/routes/downloads.ts` / `backend/src/services/downloader.ts`
marks a download job `done`, delete any matching recommendation row right
then:

```ts
db.prepare('DELETE FROM recommendations WHERE source_id = ?').run(sourceId);
```

This also fixes it for `getGenreRecommendations()` if that ever gets a similar
caching layer later — same principle: never trust a cached recommendation to
still be un-owned, always check at read time.

---

## 4. Search tab conflates local + online search, and can't play an online result without downloading it

**Root cause A**: `frontend/src/app/(tabs)/search.tsx` has a `'library' | 'online'`
toggle baked into the single Search tab, duplicating what the Library tab
should own.

**Root cause B**: online results only render a Download button
(`handleDownloadOnline`). The backend's `GET /api/search/online` only ever
returns metadata (`sourceId`, `title`, `artistName`, `thumbnailUrl`,
`durationSec`, `sourceUrl`) — nothing playable exists until a full download
completes. There's no way to preview/stream before committing to a permanent
download, which is why you're forced to download just to listen.

**Fix, part 1 — split the screens**:
- In `search.tsx`: delete the `'library' | 'online'` tab state entirely. This
  screen becomes online-only (YouTube Music search), still gated behind
  `isOnline` exactly as it already is. Update the header copy accordingly
  ("Search YouTube Music" instead of a toggle).
- In `frontend/src/app/(tabs)/library.tsx`: add a real search bar at the top of
  the songs section — a `TextInput` bound to a `q` state, passed into the
  existing `api.getSongs({ q, genre, sort, limit: 100 })` call. This is where
  "search what I already have" belongs.

**Fix, part 2 — make online results playable without downloading**:

New backend route in `backend/src/routes/search.ts`, proxy-streaming audio
straight from YouTube without saving anything to disk:

```ts
import { spawn } from 'node:child_process';

fastify.get('/api/search/online/stream', async (request: FastifyRequest<{
  Querystring: { url?: string }
}>, reply: FastifyReply) => {
  const { url } = request.query;
  if (!url) {
    return reply.status(400).send({
      error: { code: 'INVALID_REQUEST', message: 'url is required' }
    });
  }

  reply.header('Content-Type', 'audio/webm');
  reply.header('Cache-Control', 'no-store');

  const child = spawn('yt-dlp', ['-f', 'bestaudio', '-o', '-', url, '--no-warnings']);
  child.on('error', () => { if (!reply.sent) reply.status(502).send(); });
  return reply.send(child.stdout);
});
```

Note the trade-off: this is a live pipe, so it can't support HTTP Range
requests — no seeking while previewing an un-downloaded track. That's an
acceptable limitation for a "preview before you commit to downloading" flow;
it's not a regression since nothing playable existed here before at all.
Downloaded/local files keep full seek support via the existing
`/api/songs/:id/stream` Range-aware endpoint — this new route is additive,
not a replacement.

Frontend wiring in `search.tsx`: tapping an online result's row (not just the
Download button) calls `audioEngine.load()` with a synthetic `Song`-shaped
object whose stream URL points at
`${getApiBaseUrl()}/api/search/online/stream?url=${encodeURIComponent(item.sourceUrl)}`.
The Download button stays exactly as-is, as a separate explicit action for
"also save this permanently for offline."

Mention to the user in the UI (a small label under the scrub bar, e.g. "Live
preview — download to save & enable seeking") when playing an undownloaded
online result, so the seek limitation isn't a silent surprise.

---

## 5. Wrapped shouldn't be a permanent bottom-nav tab

**Root cause**: `frontend/src/app/(tabs)/_layout.tsx` lists `stats` (Wrapped)
as one of 5 equal-weight bottom tabs, alongside Home/Search/Library/Settings —
giving daily-use screen real estate to something checked occasionally.

**Fix**:
- Remove the `stats` `<Tabs.Screen>` entry from `(tabs)/_layout.tsx` — down to
  4 tabs: Home, Search, Library, Settings.
- Add a menu affordance to reach it intentionally instead — simplest option:
  a small icon button (e.g. `ellipsis-horizontal` or a hamburger icon) in the
  Home screen header, next to or near the existing Import button, opening a
  lightweight modal/sheet with a link to Wrapped (and anywhere else secondary
  that comes up later — this becomes the natural home for "not every day"
  screens going forward).
- The `stats.tsx` screen itself doesn't need to change — only how it's reached.
  Since it's no longer a `Tabs.Screen`, move the route to a plain
  `frontend/src/app/wrapped.tsx` (outside the `(tabs)` group) and push to it
  with `router.push('/wrapped')` from the new menu.

---

## Testing checklist

1. Every screen's header content sits clearly below the system status bar —
   check Home, Search, Library, Settings, and the new Wrapped route.
2. Set repeat to "all", confirm the plain repeat icon in primary color. Set to
   "one", confirm it visibly changes to the repeat-one glyph. Set to "off",
   confirm it goes back to muted/gray.
3. Download a song shown in Daily Recommendations via its "Get" button; after
   it completes, confirm it disappears from the recommendations list without
   needing to wait or force a full app restart.
4. Library tab: type a query in its own search bar, confirm it filters your
   local songs only. Search tab: confirm the library/online toggle is gone and
   it's online-only.
5. While online, tap an online search result directly (not its Download
   button): confirm it starts playing within a couple seconds without any
   download having happened. Then tap Download on the same result separately,
   confirm it saves normally and later plays with full seek support.
6. Confirm the bottom bar shows exactly 4 tabs, and Wrapped is reachable only
   through the new menu, not the bottom bar.
