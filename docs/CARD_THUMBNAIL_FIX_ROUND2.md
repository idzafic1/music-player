# Card Thumbnail Fix, Round 2 — Generalize to List Rows

`docs/CARD_THUMBNAIL_FIX.md` fixed the vertical Home cards (`recCard`,
`playlistCard`) but missed the identical bug in the components that actually
render most of the app: `SongListItem.tsx` (Library, Search's local results,
Playlist detail, Artist detail, Home's Recently Played and Favorites all use
this one component) and `search.tsx`'s separately-implemented online results
row. Same root cause as before — the row's own padding wraps the thumbnail
instead of only wrapping the text — just in a horizontal layout this time.

## The general rule

A thumbnail image should always be flush with the edges of **its own
immediate row/card background**, with zero gap — whether that card is a
vertical stack (image on top, text below, like Home's cards) or a horizontal
row (image on the left, text beside it, like every list item in this app).
Padding belongs only around text and buttons, never around the image itself.

**Explicitly NOT in scope, and should stay as they are:**
- `MiniPlayer.tsx` — its outer bar has no rounded corners or margin (it's a
  full-width persistent toolbar, not a floating card), so there's no card edge
  for its small thumbnail to be flush with. Leave it alone.
- Library's Artist/Playlist row icons (`cardIconBox` in `library.tsx`) — those
  are decorative colored circles with an icon inside, not real thumbnail
  images. Nothing to make edge-to-edge there.

## Fix 1: `frontend/src/components/SongListItem.tsx` (highest impact — used everywhere)

Change `container`'s `alignItems` from `'center'` to `'stretch'` so children
fill the row's actual height (which becomes driven by the text side's
content), move the row's padding off `container` and onto `infoContainer` /
`actionsContainer` instead, and let `artContainer` stretch to match:

```ts
container: {
  flexDirection: 'row',
  alignItems: 'stretch',        // was 'center' — lets children fill row height
  borderRadius: 12,
  marginHorizontal: 12,
  marginVertical: 4,
  backgroundColor: Colors.surface,
  overflow: 'hidden',           // clips thumbnail to the row's rounded corners
},
containerCurrent: {
  backgroundColor: Colors.surfaceElevated,
  borderColor: Colors.primaryGlow,
  borderWidth: 1,
},
artContainer: {
  width: 56,
  // no fixed height and no borderRadius here anymore — it stretches to match
  // the row's height via container's alignItems:'stretch', and gets clipped
  // to the row's rounded corners via container's overflow:'hidden'
  position: 'relative',
  backgroundColor: Colors.surfaceBorder,
  justifyContent: 'center',
  alignItems: 'center',
},
infoContainer: {
  flex: 1,
  marginLeft: 12,
  paddingVertical: 10,          // padding moved here from container
  justifyContent: 'center',
},
actionsContainer: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  paddingRight: 12,             // padding moved here from container
},
```

`art`, `placeholderArt`, and `playingBadge` (which uses
`...StyleSheet.absoluteFill`) need no changes — they already fill whatever
size `artContainer` ends up being.

## Fix 2: `frontend/src/app/(tabs)/search.tsx` online results row — same treatment

```ts
onlineItem: {
  flexDirection: 'row',
  alignItems: 'stretch',        // was 'center'
  borderRadius: 12,
  marginHorizontal: 12,
  marginVertical: 4,
  backgroundColor: Colors.surface,
  overflow: 'hidden',
},
itemTouchable: {
  flex: 1,
  flexDirection: 'row',
  alignItems: 'stretch',        // was 'center'
},
onlineThumb: {
  width: 56,
  // no fixed height, no borderRadius, no margin — flush with the row's own
  // top/bottom/left edges now
  backgroundColor: Colors.surfaceBorder,
  justifyContent: 'center',
  alignItems: 'center',
  position: 'relative',
},
onlineInfo: {
  flex: 1,
  marginLeft: 12,
  paddingVertical: 10,          // padding moved here
  justifyContent: 'center',
},
downloadBtn: {
  /* keep all existing properties on this style unchanged */
  marginVertical: 10,           // add these two so it doesn't touch the row's
  marginRight: 12,              // top/bottom/right edges now that container padding is gone
},
```

`art` and `playOverlay` need no changes.

## Testing checklist

1. Open Library's Songs list: every row's thumbnail touches the row's own
   left, top, and bottom edges, with the row's rounded corners visible on the
   thumbnail's top-left and bottom-left corners specifically (not a smaller
   rounded square floating inside with a gap).
2. Same check on: Home's Recently Played and Favorites sections, Playlist
   detail, Artist detail, and Search's "Library" tab-equivalent local results.
3. Search's online results (YouTube Music tab): same check, plus confirm the
   Download button on the right still looks correctly spaced from the row's
   edges (it should NOT be edge-to-edge — only the thumbnail should).
4. Confirm text (title/artist/duration) still has clear left and right
   padding — it should never touch the row edges, only the thumbnail should.
5. Confirm MiniPlayer's small thumbnail is unchanged (still fine as-is, not
   part of this fix), and confirm Library's Artist/Playlist icon circles are
   unchanged too.
