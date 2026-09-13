# Agent Constitution — Superseded

This document has been superseded by `docs/AGENTIC_PRODUCT_MASTER_SPEC.md`,
which is more complete (explicit playback state machine, source-of-truth
precedence rules, a feature backlog, and a definition of done) and is now the
single governing document for this repo.

Read `docs/AGENTIC_PRODUCT_MASTER_SPEC.md` instead of this file.

## Why this file used to exist, and why it was retired

Having two overlapping "constitution"-style documents in the same repo led to
a real, live contradiction: this file correctly stated that Library's "Recent"
sort should NOT be capped at 5 (a confirmed bug, found and fixed in
`backend/src/services/library.ts`), while `AGENTIC_PRODUCT_MASTER_SPEC.md`
independently stated, in four places, that it SHOULD be capped at 5 — silently
reintroducing the same bug for any agent that read the master spec first.

That contradiction has been corrected directly in
`AGENTIC_PRODUCT_MASTER_SPEC.md`. Going forward, don't create a second
governing document alongside it — extend that one file instead, so this
class of silent contradiction can't happen again.
