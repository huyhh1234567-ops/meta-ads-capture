# Capture performance — 6.4.0

Measured 2026-10-12. Synthetic clock, identical stable content signature, no loaders, same readiness helper. This isolates fixed waiting overhead; it does not measure Meta rendering FPS, network, screenshot encoding, upload or whole-batch latency.

| Attempt | Baseline → result | Decision | Evidence |
|---|---|---|---|
| Meta fast readiness: minimum 600 ms, sampling 200 ms | 1,280 → 600 ms | Kept | `tests/performance-regression.js`; three identical samples, pending-image and timeout guards still pass |
| Preserve native DPR instead of forced minimum 2× | Forced 2 at DPR 1 → unchanged DPR 1/1.25/2 | Kept for correctness | `tests/recovery-regression.js`; no browser zoom calls. No total-latency speedup measured or claimed |

Persistent-loader and Campaign fallback cannot bypass unfinished/broken images. Steady mode still respects the configured minimum. Native smooth scrolling and exact-position completion stay unchanged; crop/coverage/scroll-interference checks still gate output.

Name-only searches must scan the full hierarchy to detect duplicates across virtualized viewports. This can be slower than the old unsafe first-match behavior. Imported IDs allow direct matching and should be preferred for large lists; no approximate-name shortcut is introduced.

Remaining field validation: same ads, same browser zoom, foreground vs background; measure total capture time and visible stutter before claiming smoother end-to-end operation. Headless popup smoke testing does not validate Meta capture or background rendering.
