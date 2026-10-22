# Visual review: demo/intro

Source SHA-256: c14ff630deebdaa2bdcbc8b085283953ce3b2a35a547aefb0b17e05e57db9e78

Validation: exit 0
Warnings: none
Errors: none

| Shot | Local | Global | Capture | File |
| --- | ---: | ---: | --- | --- |
| title | 0 | 0 | captured | screenshots/title-local-0000-global-0000.png |
| title | 20 | 20 | captured | screenshots/title-local-0020-global-0020.png |
| title | 29 | 29 | captured | screenshots/title-local-0029-global-0029.png |
| title | 59 | 59 | captured | screenshots/title-local-0059-global-0059.png |
| diagram | 0 | 60 | captured | screenshots/diagram-local-0000-global-0060.png |
| diagram | 22 | 82 | captured | screenshots/diagram-local-0022-global-0082.png |
| diagram | 30 | 90 | captured | screenshots/diagram-local-0030-global-0090.png |
| diagram | 44 | 104 | captured | screenshots/diagram-local-0044-global-0104.png |
| diagram | 66 | 126 | captured | screenshots/diagram-local-0066-global-0126.png |
| diagram | 89 | 149 | captured | screenshots/diagram-local-0089-global-0149.png |
| close | 0 | 150 | captured | screenshots/close-local-0000-global-0150.png |
| close | 29 | 179 | captured | screenshots/close-local-0029-global-0179.png |
| close | 59 | 209 | captured | screenshots/close-local-0059-global-0209.png |
| commit | 0 | 210 | captured | screenshots/commit-local-0000-global-0210.png |
| commit | 29 | 239 | captured | screenshots/commit-local-0029-global-0239.png |
| commit | 59 | 269 | captured | screenshots/commit-local-0059-global-0269.png |
| commit | 60 | 270 | captured | screenshots/commit-local-0060-global-0270.png |
| commit | 89 | 299 | captured | screenshots/commit-local-0089-global-0299.png |
| commit | 90 | 300 | captured | screenshots/commit-local-0090-global-0300.png |
| commit | 119 | 329 | captured | screenshots/commit-local-0119-global-0329.png |

Review: accepted
Reviewer: agent: Framecraft review agent
Findings:
- No visual defect against the corrected inferred brief after individually opening all 20 new PNGs. Title local 0 is blank and 20/29/59 show the full unclipped word; diagram local 0/22/30/44/66/89 shows the pulse advancing and the Frame node growing while both labels remain readable.
- Close local 0/29/59 keeps its entire sentence centered and readable. Commit local 0 has the prompt/cursor, 29 partial typing, 59 an incomplete command, 60 the complete command with output still hidden at its delay boundary, 89 visible output without the rule, 90 visible output at the zero-width rule onset, and 119 a full in-viewport rule.
- Hard-cut pairs at global 59/60, 149/150 and 209/210 are distinct and unclipped. All 20 new PNG hashes match the corresponding historical capture, but the corrected brief changes the project source digest; the historical artifact has not been changed.
Notes: Agent inspected each of the 20 new PNG files in docs/reviews/demo-intro-final/screenshots individually with an image-capable reader, including all three cut pairs, first/middle/last frames and four explicit milestones. Compared the 20 new hashes with docs/reviews/demo-intro/manifest.json; all match. Acceptance is a named agent judgment against the corrected inferred brief on sampled stills only, not automatic visual validation, full-motion playback or human review. Only brief text was revised; no shot HTML or PNG was edited.
