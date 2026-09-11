#!/usr/bin/env bash
#
# add_offline_downloads_spec.sh
#
# Run this from inside your existing cloned music-player repo
# (the one at https://github.com/idzafic1/music-player).
# It adds docs/OFFLINE_DOWNLOADS.md — a spec for on-device offline
# playback, written against your actual current code — and patches
# the stale "stretch goal" note in docs/FRONTEND_APP.md.
#
# Usage:
#   cd /path/to/music-player
#   chmod +x add_offline_downloads_spec.sh
#   ./add_offline_downloads_spec.sh

set -euo pipefail

if [[ ! -d "docs" || ! -d "frontend" || ! -d "backend" ]]; then
  echo "ERROR: run this from the root of the music-player repo (docs/, frontend/, backend/ not found here)." >&2
  exit 1
fi

echo "==> Writing docs/OFFLINE_DOWNLOADS.md"
cat > "docs/OFFLINE_DOWNLOADS.md" << 'EOF'
# On-Device Offline Downloads

## Why this doc exists

As of now, `frontend/src/services/audioEngine.ts` builds its playback source
unconditionally from `getFullStreamUrl(song.id)` in **both**
`NativeAudioEngine.load()` and `WebAudioEngine.load()`. There is no on-device
file storage, no local index of "downloaded" songs, and no fallback path.
Every play — including songs the user considers already "downloaded" — requires
a live connection to the backend. If the backend is unreachable, nothing plays,
not even something played yesterday.

This doc specifies the fix: real on-device downloads, so playback of anything
already downloaded works with **zero** backend connectivity. This supersedes
the "stretch goal, not v1" framing previously in `FRONTEND_APP.md` — this is
now core functionality, not a nice-to-have.

## What does NOT change

The backend stays the permanent library/source of truth — `backend/src/services/downloader.ts`
still pulls from YouTube via yt-dlp and stores server-side in `backend/data/audio/`.
On-device storage is a **cache of convenience for offline playback**, not a
replacement. Deleting a device download only deletes the local copy; the song
stays in the backend library and can be re-downloaded to-device anytime while
online.

## New packages

```bash
cd frontend
npx expo install expo-file-system @react-native-async-storage/async-storage
```

`@react-native-community/netinfo` is already installed (`^12.0.1`) — reuse it,
don't reinstall.

## New file: `frontend/src/services/offlineStorage.ts`

Responsibilities:
- Download a song's audio from `getFullStreamUrl(song.id)` to
  `FileSystem.documentDirectory + 'downloads/<songId>.m4a'`
- Maintain ONE JSON index in AsyncStorage under the key
  `offline_downloads_index` — `Record<songId, { localUri: string; downloadedAt: number; sizeBytes: number }>`.
  One key, not one-per-song, so reads/writes stay cheap.
- Expose:
  - `downloadSong(song: Song, onProgress?: (pct: number) => void): Promise<void>`
  - `deleteDownload(songId: string): Promise<void>`
  - `getLocalUri(songId: string): Promise<string | null>`
  - `isDownloaded(songId: string): Promise<boolean>`
  - `listDownloadedIds(): Promise<string[]>`
  - `getTotalDownloadedBytes(): Promise<number>`

Starting-point implementation for the agent to adapt:

```ts
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Song, getFullStreamUrl } from './api';

const INDEX_KEY = 'offline_downloads_index';
const DOWNLOAD_DIR = FileSystem.documentDirectory + 'downloads/';

type IndexEntry = { localUri: string; downloadedAt: number; sizeBytes: number };
type Index = Record<string, IndexEntry>;

async function readIndex(): Promise<Index> {
  const raw = await AsyncStorage.getItem(INDEX_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function writeIndex(index: Index): Promise<void> {
  await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

async function ensureDirExists(): Promise<void> {
  const info = await FileSystem.getInfoAsync(DOWNLOAD_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(DOWNLOAD_DIR, { intermediates: true });
  }
}

export async function downloadSong(
  song: Song,
  onProgress?: (pct: number) => void
): Promise<void> {
  await ensureDirExists();
  const localUri = DOWNLOAD_DIR + song.id + '.m4a';

  const downloadResumable = FileSystem.createDownloadResumable(
    getFullStreamUrl(song.id),
    localUri,
    {},
    (progressEvent) => {
      if (onProgress && progressEvent.totalBytesExpectedToWrite > 0) {
        onProgress(progressEvent.totalBytesWritten / progressEvent.totalBytesExpectedToWrite);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('Download failed: no result');

  const fileInfo = await FileSystem.getInfoAsync(result.uri);
  const sizeBytes = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;

  const index = await readIndex();
  index[song.id] = { localUri: result.uri, downloadedAt: Date.now(), sizeBytes };
  await writeIndex(index);
}

export async function deleteDownload(songId: string): Promise<void> {
  const index = await readIndex();
  const entry = index[songId];
  if (entry) {
    await FileSystem.deleteAsync(entry.localUri, { idempotent: true });
    delete index[songId];
    await writeIndex(index);
  }
}

export async function getLocalUri(songId: string): Promise<string | null> {
  const index = await readIndex();
  return index[songId]?.localUri ?? null;
}

export async function isDownloaded(songId: string): Promise<boolean> {
  return (await getLocalUri(songId)) !== null;
}

export async function listDownloadedIds(): Promise<string[]> {
  return Object.keys(await readIndex());
}

export async function getTotalDownloadedBytes(): Promise<number> {
  const index = await readIndex();
  return Object.values(index).reduce((sum, e) => sum + (e.sizeBytes || 0), 0);
}
```

## New file: `frontend/src/store/offlineStore.ts`

Same Zustand pattern as the existing `settingsStore.ts`/`playerStore.ts`:

```ts
import { create } from 'zustand';
import { Song } from '../services/api';
import * as offlineStorage from '../services/offlineStorage';

interface OfflineState {
  downloadedSongIds: Set<string>;
  downloadingIds: Set<string>;
  downloadProgress: Record<string, number>;

  hydrate: () => Promise<void>;
  download: (song: Song) => Promise<void>;
  remove: (songId: string) => Promise<void>;
  isDownloaded: (songId: string) => boolean;
}

export const useOfflineStore = create<OfflineState>((set, get) => ({
  downloadedSongIds: new Set(),
  downloadingIds: new Set(),
  downloadProgress: {},

  hydrate: async () => {
    const ids = await offlineStorage.listDownloadedIds();
    set({ downloadedSongIds: new Set(ids) });
  },

  download: async (song: Song) => {
    set((s) => ({ downloadingIds: new Set(s.downloadingIds).add(song.id) }));
    try {
      await offlineStorage.downloadSong(song, (pct) => {
        set((s) => ({ downloadProgress: { ...s.downloadProgress, [song.id]: pct } }));
      });
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        return {
          downloadedSongIds: new Set(s.downloadedSongIds).add(song.id),
          downloadingIds: downloading,
        };
      });
    } catch (err) {
      set((s) => {
        const downloading = new Set(s.downloadingIds);
        downloading.delete(song.id);
        return { downloadingIds: downloading };
      });
      throw err;
    }
  },

  remove: async (songId: string) => {
    await offlineStorage.deleteDownload(songId);
    set((s) => {
      const ids = new Set(s.downloadedSongIds);
      ids.delete(songId);
      return { downloadedSongIds: ids };
    });
  },

  isDownloaded: (songId: string) => get().downloadedSongIds.has(songId),
}));
```

Call `useOfflineStore.getState().hydrate()` once in `frontend/src/app/_layout.tsx` on
app start, the same place `_layout.tsx` already does its other startup wiring.

## Modify `frontend/src/services/audioEngine.ts`

In `NativeAudioEngine.load()`, before `TrackPlayer.add({...})`:

```ts
import { getLocalUri } from './offlineStorage';
// ...
const localUri = await getLocalUri(song.id);
const url = localUri || getFullStreamUrl(song.id);
// then use `url` instead of `getFullStreamUrl(song.id)` in TrackPlayer.add({ ..., url })
```

Same change in `WebAudioEngine.load()`, using `url` in place of `getFullStreamUrl(song.id)`
inside the `new Howl({ src: [url], ... })` call. (On web, `localUri` will typically be
null since `expo-file-system` behaves differently there — that's fine, web falls back
to streaming, which matches how a browser PWA is expected to behave anyway.)

## UI integration

- `frontend/src/components/SongOptionsMenuModal.tsx` — add a "Download" /
  "Remove download" toggle action wired to `useOfflineStore`. Show progress
  (from `downloadProgress[song.id]`) while `downloadingIds.has(song.id)` is true.
- `frontend/src/components/SongListItem.tsx` — small downloaded-checkmark badge
  when `useOfflineStore.getState().isDownloaded(song.id)` is true, using the
  existing `@expo/vector-icons` already in the project.
- `frontend/src/app/(tabs)/library.tsx` — optional "Downloaded only" filter
  toggle alongside the existing genre chips (`GenreChips.tsx`), filtering by
  `downloadedSongIds`.

## Connectivity gating

`frontend/src/store/settingsStore.ts` already has an `isOnline` field and a
`setOnline` action, but confirm whether anything actually calls `NetInfo.addEventListener`
to drive it — wire that up in `_layout.tsx` if it isn't already there. When
`isOnline` is false: hide/disable the online-search tab in
`frontend/src/app/(tabs)/search.tsx`, but Library/Playlists/Favorites/playback
of any downloaded song must keep working exactly as normal — those only depend
on whether that specific song has a `localUri`, never on `isOnline`.

## Testing checklist

1. Download a song to-device via the new UI action; confirm it appears with a
   downloaded badge.
2. Fully disconnect the device from the network (airplane mode, or the
   emulator's network toggle).
3. Confirm the downloaded song plays start to finish, seek works, mini-player
   and full player both work.
4. Confirm a song that was NOT downloaded fails gracefully (a clear toast/error,
   not a silent hang or crash) when offline.
5. Confirm the Library screen doesn't hard-crash if the initial `/api/songs`
   fetch is unreachable — it should still show whatever's already in memory/state.
6. Reconnect, confirm normal streaming resumes for non-downloaded songs.
EOF

echo "==> Patching docs/FRONTEND_APP.md (removing stale 'stretch goal' framing)"
python3 << 'PYEOF'
import re

path = "docs/FRONTEND_APP.md"
with open(path, "r") as f:
    content = f.read()

old = """## Offline-first playback caching (stretch goal, not v1)

Full on-device audio caching (so playback works with zero backend connectivity)
is out of scope for the initial build — see `TASKS_ROADMAP.md` Phase 8. v1 assumes
the backend is reachable on the LAN whenever the app is used."""

new = """## Offline-first playback caching

This is core v1 functionality, not a stretch goal — see `docs/OFFLINE_DOWNLOADS.md`
for the full spec (new `offlineStorage.ts` service, `offlineStore.ts` Zustand
store, and the exact changes needed in `audioEngine.ts`). Any song the user has
explicitly downloaded to-device must keep playing with zero backend
connectivity; only streaming of non-downloaded songs and online search require
the backend to be reachable."""

if old not in content:
    print("WARNING: expected stretch-goal text not found verbatim — file may have "
          "already been edited. Skipping automatic patch; update docs/FRONTEND_APP.md "
          "manually to point at docs/OFFLINE_DOWNLOADS.md.")
else:
    content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print("Patched.")
PYEOF

echo ""
echo "==> Done."
echo "New file:     docs/OFFLINE_DOWNLOADS.md"
echo "Patched file: docs/FRONTEND_APP.md"
echo ""
echo "Next: review the diff, commit, then hand the prompt below to your agent."
git diff --stat 2>/dev/null || true
