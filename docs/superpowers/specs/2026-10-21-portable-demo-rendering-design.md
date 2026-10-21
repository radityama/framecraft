# Portable demo rendering design

**Scope:** Remove host-font and temporary-directory differences from the four-shot demo without changing the Remotion adapter or adding runtime dependencies. Preserve the existing colors, layout, and 330-frame composition.

## Local fonts and render readiness

Vendor OFL-licensed IBM Plex Serif, IBM Plex Sans, and JetBrains Mono WOFF2 files with their corresponding licenses into `projects/demo/assets/fonts/`. A shared `fonts.css` defines the families with `font-display: block`; each shot links it by a relative URL and chooses a bundled family first. Keep system/generic fallbacks for the rare case that a file fails, but never select one as the first choice. The runtime flushes layout after `renderFrame`, waits for `document.fonts.ready`, decodes images, waits two native frames, and repeats the font wait if `document.fonts.status` has returned to `loading`. The existing acknowledgement timeout bounds a stalled seek. A browser fixture dynamically inserts text using a previously unused real local font and checks that the first acknowledged still actually renders its distinctive glyphs; the mocked font/image/frame ordering test remains.

## Seek ownership

Seek requests get a monotonically increasing generation number. At most one seek applies DOM state at a time; once its awaited work yields, a superseded request stops without sending `rendered` or an obsolete error, and the latest pending frame is applied next. A browser test posts overlapping seeks directly and checks acknowledgements plus the final DOM. Validation errors for the latest request still propagate normally.

## Diagnostics and cleanup

`validate` checks the first `font-family` entry in shot HTML/inline CSS and local linked stylesheets against reachable `@font-face` families or CSS generic families. This conservative source scan warns rather than rejecting and does not claim complete CSS parsing. Strip `xmlns` attributes before checking external URLs, retaining warnings for actual remote `src` and other URLs. Project fixture roots use `os.tmpdir()`. Every `bundle()` caller removes only the directory path returned by its own `bundle()`, in `finally`, including on errors; tests demonstrate successful and failing cleanup without deleting unrelated bundles.

## Hash and documentation

Keep the atomic JSON report and six existing frames, adding title 59, close 0, and commit 0/30/75/119. Include `fc-list` family/file paths for requested fonts when available, otherwise `null`. On this machine regenerate twice and compare reports; changed fonts intentionally change PNG hashes. Update authoring guidance with a minimal relative-path shot skeleton, both timeline forms, viewport/plain DOM behavior, ignored return values and thrown errors, CSS animation fill/delay rules, and first/last frame checks. Document exact Linux VPS commands and `jq` frame comparison, with a first-differing-frame still inspection on mismatch. Cross-machine identity remains unverified until an actual second host is run and recorded.

## Verification

Run browser/CLI tests, clean demo validation, two matching local hash runs, and a full export confirmed by ffprobe as exactly 330 frames at 1920×1080/30. Do not modify `src/spike/shot.tsx` or `src/spike/index.tsx` unless a failing integration test requires it. Preserve the untracked `framecraft.zip` untouched.
