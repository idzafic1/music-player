---
name: doc-conflict-check
description: >-
  Use this skill at the start of any task that involves reading multiple docs/
  files for requirements, and before treating any doc's stated rule as
  authoritative.
---

# Doc Conflict Check Skill

This skill exists because this repo has previously contained two separate
"constitution"-style documents that silently disagreed with each other on a
real behavioral rule (Library's Recent-sort item limit), and an agent that
read only one of them implemented the wrong, already-reverted version of a
bug fix as a result.

## Core Procedures

1. **Before implementing any rule stated in a docs/ file, grep for the same
   topic across all other docs**:
   ```bash
   grep -rniE "<key term from the rule>" docs/
   ```
   For example, before implementing anything about sort limits, pagination,
   or "recent," search for all mentions across every doc, not just the one
   currently open.

2. **If two docs disagree**, do not silently pick one. Flag it explicitly in
   your response/report, state which one you're treating as authoritative and
   why (prefer: the most recently modified file, unless the user's own most
   recent message says otherwise), and note that the conflicting doc should
   be corrected or removed.

3. **`docs/AGENTIC_PRODUCT_MASTER_SPEC.md` is the single governing document**
   for this repo as of this skill's creation. Any other doc that restates
   product-wide rules (rather than a specific, scoped feature spec) should be
   treated with suspicion — check whether it's stale before trusting it over
   the master spec.

4. **A scoped, single-feature doc** (e.g. `docs/OFFLINE_DOWNLOADS.md`,
   `docs/HOME_LIBRARY_POLISH.md`) is not in conflict with the master spec
   merely by covering the same feature in more detail — conflict means an
   actual contradictory instruction (e.g. one says cap at 5, another says
   don't cap). Use judgment; don't flag every doc that touches a related
   topic.
