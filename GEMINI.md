# GEMINI.md

This file is read automatically by Gemini CLI when working in this repo. Follow it.

## What this project is

A single-user personal music player: Node.js/TypeScript backend (downloads audio
from YouTube via yt-dlp, serves it, tracks plays/ratings/playlists in SQLite) plus
an Expo (React Native + react-native-web) frontend that ships as one Android app
and one browser PWA from a single codebase. No accounts, no multi-user logic —
everything is scoped to one listener.

## Read these first, in order

1. `docs/README.md` — stack summary and ground rules
2. `docs/ARCHITECTURE.md` — components and data flow
3. `docs/DATABASE_SCHEMA.md` — every table, authoritative schema
4. `docs/API_SPEC.md` — every endpoint, request/response shapes
5. `docs/DOWNLOADER_SERVICE.md` — yt-dlp/ffmpeg download + playlist import flow
6. `docs/RECOMMENDATIONS_ENGINE.md` — daily job + genre/mood recommendations
7. `docs/UI_DESIGN.md` — visual design system: colors, typography, layout,
   navigation, motion, responsive rules — the frontend must follow this, not
   improvise defaults
8. `docs/FRONTEND_APP.md` — every screen, its states, the component inventory,
   the audio engine abstraction, the 15s qualifying-play timer logic
9. `docs/TASKS_ROADMAP.md` — the phase order to build in; work through phases in
   order, don't jump ahead

The frontend is not an afterthought here — `UI_DESIGN.md` and `FRONTEND_APP.md`
together are meant to be as prescriptive as the backend docs. Don't default to
unstyled/placeholder UI "to be polished later" — build each screen against the
design system from the start.

Before writing code for a feature, read the relevant doc(s) above in full rather
than guessing from the filenames — they contain exact schemas, endpoint shapes,
and sequencing that the code must match.

## Working agreement

- **Schema is the source of truth.** If a change requires deviating from
  `docs/DATABASE_SCHEMA.md`, update that file in the same change — never let the
  code and the doc drift apart.
- **Same rule for `docs/API_SPEC.md`** — if an endpoint's shape changes, the doc
  changes with it.
- Don't add authentication/accounts/multi-tenancy anywhere. This is a
  single-user app; the only auth concept is the optional static API token
  described in `docs/API_SPEC.md`.
- Follow the phase order in `docs/TASKS_ROADMAP.md`. Don't build the
  recommendations engine before basic playback works, don't build online search
  before the local library works, etc.
- Playback logic (the audio engine abstraction, the 15-second play-qualifying
  timer) is the trickiest cross-platform seam in this project — see
  `docs/FRONTEND_APP.md` for the exact interface every screen should depend on.
  Keep native (`react-native-track-player`) and web (browser `Audio`/howler)
  implementations behind that one interface; never let a screen import a
  platform-specific playback library directly.
- Prefer boring, debuggable code. This is maintained by one person occasionally
  poking at it, not a team.

## Commands

Fill these in once the repo is scaffolded (Phase 0 of the roadmap):
- Backend: `npm run dev` / `npm run migrate` / `npm test`
- Frontend: `npx expo start` (native) / `npx expo start --web` (browser)

## When something in the docs seems wrong or outdated

Flag it and ask, rather than silently deviating — these docs were written before
any code existed, so gaps are expected. Update the relevant doc once the real
answer is settled.
