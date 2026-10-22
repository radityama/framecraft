# Agent workflow for the demo intro

Any repository-aware coding agent can read `AGENTS.md` and the six local `skills/framecraft-*/SKILL.md` Markdown guides directly. No provider-specific skill installation or MCP server is required. The renderer statically registers only the demo intro scene; these commands are not arbitrary-project export.

1. Inspect `projects/demo/project.json` and `projects/demo/scenes/intro/scene.json` for size, frame rate, order, cuts and audio.
2. Read the scene brief or supplied requirements. `projects/demo/scenes/intro/brief.md` is **inferred**, not a client brief.
3. Storyboard shot IDs, durations, intent, cuts and reveal milestones against the manifests.
4. Author or revise each HTML shot using the public API in `AGENTS.md`; inspect targeted stills with `bun run snap` and seek in Studio.
5. Run `bun run validate`; resolve warnings and errors without mistaking a passing scan for visual approval.
6. Capture to a fresh directory with `bun run review --output <new-directory> --milestone <shot:local-frame>` (repeat milestones as needed).
7. Open **each** PNG listed in the manifest, including first/last frames and both sides of each cut; note legibility, motion states, cropping and defects by shot/frame.
8. Fix only observed defects against the requirements; preserve prior artifacts, recapture to another new directory, and re-inspect all its PNGs.
9. After inspection, edit only the manifest `review` section with status, named reviewer, findings and notes; run `bun run review --summary <manifest>` then `bun run review --check <manifest>`. These commands do not automatically accept quality.
10. Run `bun run render`; inspect the MP4 and probe its video/audio streams using `docs/rendering.md`. Use `docs/audio.md` for supplied local sound and optional narration. Report checks not performed.
