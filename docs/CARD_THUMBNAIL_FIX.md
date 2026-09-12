# Card Thumbnail Fix (Edge-to-Edge) + Round-4 Notes

## The bug

In `frontend/src/app/(tabs)/index.tsx`, both `playlistCard` (My Playlists
section) and `recCard` (Daily Recommendations section) apply `padding: 10` to
the whole card — wrapping the thumbnail AND the text below it in the same
10px inset. That's why thumbnails sit in a visibly padded box instead of
running flush to the card's edges, most noticeable on the "My Playlists"
cards but present identically on the recommendation cards too.

## The fix

Standard pattern: image runs edge-to-edge and flush with the card's own
rounded corners (via `overflow: 'hidden'` on the card), text gets its own
padding underneath. Apply this to **both** cards — same bug, same fix, twice.

### `playlistCard` / `playlistThumbContainer` / `playlistThumb`

```ts
playlistCard: {
  width: 140,
  backgroundColor: Colors.surface,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: Colors.surfaceBorder,
  overflow: 'hidden', // clips the thumbnail to the card's rounded corners
},
playlistThumbContainer: {
  width: '100%',
  height: 140,
  backgroundColor: 'rgba(6, 182, 212, 0.12)',
  justifyContent: 'center',
  alignItems: 'center',
  // no borderRadius or margin here — the card's own overflow:hidden + radius
  // handle the clipping now that this touches every edge
},
playlistThumb: {
  width: '100%',
  height: '100%',
},
playlistCardTitle: {
  fontSize: 13,
  fontWeight: '600',
  color: Colors.textPrimary,
  paddingHorizontal: 10,
  marginTop: 8,
},
playlistCardCount: {
  fontSize: 11,
  color: Colors.textMuted,
  marginTop: 2,
  paddingHorizontal: 10,
  marginBottom: 10,
},
```

Remove the old `padding: 10` and `marginBottom: 8` from wherever they currently
sit on `playlistCard`/`playlistThumbContainer` — the padding moves to the two
text styles above instead.

### `recCard` / `recThumbContainer` / `recThumb` — same treatment

```ts
recCard: {
  width: 140,
  backgroundColor: Colors.surface,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: Colors.surfaceBorder,
  overflow: 'hidden',
},
recThumbContainer: {
  width: '100%',
  height: 140,
  position: 'relative',
  backgroundColor: Colors.surfaceBorder,
},
recThumb: {
  width: '100%',
  height: '100%',
},
recTitle: {
  fontSize: 13,
  fontWeight: '600',
  color: Colors.textPrimary,
  marginTop: 8,
  paddingHorizontal: 10,
},
recArtist: {
  fontSize: 11,
  color: Colors.textSecondary,
  marginTop: 2,
  paddingHorizontal: 10,
},
recReason: {
  fontSize: 10,
  color: Colors.primaryLight,
  marginTop: 4,
  fontStyle: 'italic',
  paddingHorizontal: 10,
  marginBottom: 10,
},
```

The existing "Get" download pill (`downloadPill`, `position: 'absolute',
bottom: 8, right: 8`) sits inside `recThumbContainer` and needs no change —
it's already inset from that container's own edges, so it stays correctly
placed once the container itself becomes edge-to-edge.

## Optional (not required, worth considering later)

The exact same padding-wraps-everything bug showed up in two separate places
because the same "thumbnail + text" card shape was hand-copied twice with
slightly different style names (`recCard`/`recThumb...` vs
`playlistCard`/`playlistThumb...`). Worth extracting a single shared
`<MediaCard thumbnailUrl title subtitle onPress overlay? />` component at some
point so this class of bug can't recur a third time when the next card type
gets added — not urgent, just flagging it as a maintenance win since the two
implementations are now functionally identical.

## Testing checklist

1. My Playlists cards: thumbnail image touches all four edges of the card,
   with the card's own rounded corners visible at the top two corners of the
   image (not a separate smaller rounded rectangle floating inside).
2. Daily Recommendation cards: same check, plus confirm the "Get" pill is
   still correctly positioned in the bottom-right corner of the thumbnail.
3. Title/subtitle text under both card types still has visible left/right
   padding (shouldn't touch the card edges — only the image should).
