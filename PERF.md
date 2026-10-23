# Capture performance — 6.7.0

Measured 2026-10-23 in isolated Chrome with the same 650 ms simulated Search render and 350 ms React commit delay. Once the matching rows were ready, click latency for two ID targets and one unique-name target changed from 623/621/1416 ms to 304/330/318 ms (repeat runs about 220–330 ms). Removed post-Enter fixed wait and repeated waits for the already settled viewport; retained three stable samples, exact target readiness, duplicate scans, ID checks and loading/Stop guards. This excludes real Meta network/render latency and upload.

The 6.4.0 density decision below is superseded by the user's 2026-10-23 request for sharper output. 6.7.0 renders at least 2× DPR by default, with a native-density checkbox opt-out. Real Chrome tests produce 1600×1200 PNG from an 800×600 CSS viewport starting at .75 DPR, in foreground and background. Higher pixel counts can take more encoding, upload time and memory; no capture/upload speedup is claimed for this change. Source-pixel stitching and browser zoom stay unchanged. See `tests/browser-resolution.js` and `tests/recovery-regression.js`.

## Earlier measurements (6.4.0)

Measured 2026-10-12. Synthetic clock, identical stable content signature, no loaders, same readiness helper. This isolates fixed waiting overhead; it does not measure Meta rendering FPS, network, screenshot encoding, upload or whole-batch latency.

| Attempt | Baseline → result | Decision | Evidence |
|---|---|---|---|
| Meta fast readiness: minimum 600 ms, sampling 200 ms | 1,280 → 600 ms | Kept | `tests/performance-regression.js`; three identical samples, pending-image and timeout guards still pass |
| Preserve native DPR instead of forced minimum 2× | Forced 2 at DPR 1 → unchanged DPR 1/1.25/2 | Kept for correctness | `tests/recovery-regression.js`; no browser zoom calls. No total-latency speedup measured or claimed |

Persistent-loader and Campaign fallback cannot bypass unfinished/broken images. Steady mode still respects the configured minimum. Native smooth scrolling and exact-position completion stay unchanged; crop/coverage/scroll-interference checks still gate output.

Name-only searches must scan the full hierarchy to detect duplicates across virtualized viewports. This can be slower than the old unsafe first-match behavior. Imported IDs allow direct matching and should be preferred for large lists; no approximate-name shortcut is introduced.

Remaining field validation: same ads, same browser zoom, foreground vs background; measure total capture time and visible stutter before claiming smoother end-to-end operation. Headless popup smoke testing does not validate Meta capture or background rendering.
