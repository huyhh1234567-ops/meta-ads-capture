# ADR-001: Preserve native pixels and checkpoint successful output

Resolution decision superseded on 2026-10-23 by the user's request for sharper output: 6.7.0 renders at a minimum 2x DPR by default with an opt-out to native density. CSS viewport size, browser zoom, source-pixel stitching and checkpoint behavior are preserved. This renders the page at higher density before capture; it does not upscale a captured bitmap. Metrics are cleared after completion or failure.

## Status

Accepted, 2026-10-12. Implements the approved capture-recovery/entity-navigation/region-highlights specs.

## Context

Forcing a minimum 2× DPR during background capture changed rendering density and increased work. A later error erased earlier results. Same-name entities were accepted before the virtualized hierarchy had been fully scanned, and broad highlight ancestors outlined unrelated content.

## Decision

Keep viewport stabilization for background mode, but use the tab's measured DPR and never browser zoom. Reduce only the synthetic stable-content waiting floor; retain asset readiness, overlap, coverage and interference guards.

Use one retry budget of three total attempts around the whole job. Persist completed output immediately after upload and before preview. The active workflow calls `captureOneAd` directly so the older screenshot-only retry helper cannot multiply the budget to nine. Resume reselects ancestors by imported IDs even if their images were disabled. The internal legacy retry helper remains outside the active batch flow; removal can be a separate cleanup.

Checkpoint stores jobs, successful records and next index locally. SHA-256 compares output configuration and account/page scope without storing a raw upload token in the checkpoint. This is a consistency check, not encryption or a remote authorization mechanism. Timing/tab/session/UI choices can change; list, output or account changes cannot silently reuse prior images. Copy is updated on errors and stop; no TXT is created.

Accept only advertising IDs from level-specific attributes and actual Meta navigation/selection URLs. A current Edit URL is authoritative over stale selected-row markup. Empty hrefs cannot inherit a current selected ID; multiple selected IDs do not verify a single entity. Name-only fallback must prove uniqueness across the hierarchy and verify the full Edit name before capture. Insufficient identity evidence is a visible failure, never a settings edit.

Identify local highlight subsections and draw their coordinates on the output canvas only. No whole-page ancestor fallback. Advantage uses the first subsection; TA/Budget have independent, default-off controls.

## Alternatives

- Restart the full batch after error: rejected because it discards work and creates duplicate uploads.
- Skip failed entities: rejected because the user wants to stop at the failed item and return current results immediately.
- Fuzzy or first-visible name matching: rejected because it can select another parent/entity with the same name.
- Force 2× or upscale bitmap: rejected because native pixels/zoom preservation is the requested behavior.

## Consequences and limits

Name-only full-tree scans can take longer; imported IDs are preferable. Only acknowledged successful uploads are checkpointed: an upload accepted remotely but whose response is lost may still be retried, because the current webhook has no idempotency protocol. No change to the deployed Apps Script is made here.

Tests cover logic, pixels, recovery, read-only controls and an isolated real-Chrome popup. Real Meta background rendering/smoothness is still unverified. Native resolution depends on the user's current zoom/device density; no resolution beyond source pixels is promised.
