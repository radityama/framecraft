# Visual review: demo/intro

Source SHA-256: 947b9b55695ad26c8b11ab846c0eb68b01fdefbd761ebde061fd49bc3696ed82

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
- No defect or revision warranted by the inferred brief after inspecting every capture. Title local 0 is blank as the reveal starts; local 20, 29 and 59 show the full unclipped word.
- Diagram local 0, 22, 30, 44, 66 and 89 show the amber pulse moving right and Frame growing from a smaller translucent node to a full-size readable node; HTML stays readable.
- Close local 0, 29 and 59 keep 'Made frame by frame.' centered and readable without clipping.
- Commit local 0 shows prompt/cursor, local 29 partial typing, local 59 the command before the output, local 60 the completed command with cursor, local 89 and 90 the readable output without an expanded rule, and local 119 the full rule. Text and rule stay inside the frame.
Notes: Agent opened each of the 20 individual PNGs in docs/reviews/demo-intro/screenshots, comparing first, middle, last and explicit milestone frames against the inferred scene brief. Inspected all three cut pairs, global 59/60 (title to diagram), 149/150 (diagram to close), 209/210 (close to commit): each has an intentional hard cut with no overlapping or clipped content. This is an agent's visual judgment on sampled stills only, not a human review, full-motion inspection, or automatic visual-quality guarantee. No HTML revision or recapture was needed.
