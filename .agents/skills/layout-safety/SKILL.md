---
name: layout-safety
description: >-
  Use this skill whenever implementing or reviewing a thumbnail/image inside a
  row or card whose own height is determined by its sibling content (flexbox
  stretch, auto-height rows) rather than a fixed height.
---

# Layout Safety Skill

This skill exists because the same React Native layout bug has occurred more
than once in this codebase: an image given `height: '100%'` inside a parent
whose own height is unresolved at layout time (e.g. `alignItems: 'stretch'`
inside an auto-height row) does not reliably size to the parent — it can
instead expand to fill available space, blowing out row heights across an
entire list.

## Core Procedures

1. **Never use percentage height for an image inside an auto-height flex
   container.** If the row's height is determined by its text/content side
   (not a fixed value), the image must NOT use `height: '100%'` / `width: '100%',
   height: '100%'` to fill it.

2. **Use `StyleSheet.absoluteFillObject` instead**:
   ```ts
   artContainer: {
     width: 56,           // fixed width is fine — only height is the risk
     position: 'relative',
     backgroundColor: Colors.surfaceBorder,
   },
   art: {
     ...StyleSheet.absoluteFillObject,   // NOT width:'100%', height:'100%'
   },
   ```
   This anchors the image to all four edges of its parent via absolute
   positioning, which works correctly regardless of how the parent's height
   was resolved — this is the pattern already fixed and verified on-device in
   `SongListItem.tsx` and `search.tsx`. Match it exactly for any new
   thumbnail-in-row component; don't reintroduce the percentage-height version.

3. **Any new row/card component with an image must be verified on an actual
   emulator or device before being considered done** — this exact bug class
   looks completely correct in source and passes lint/build, and only shows
   up visually at runtime. A code review is not sufficient sign-off for this
   category of change; see the `visual-regression-loop` skill.

4. **Before adding a new thumbnail-bearing component**, check
   `docs/AGENTIC_PRODUCT_MASTER_SPEC.md` section 6.2 (Thumbnail rules) and
   `docs/CARD_THUMBNAIL_FIX_ROUND2.md` for the established pattern, rather
   than re-deriving a layout approach from scratch.
