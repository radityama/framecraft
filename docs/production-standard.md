# Framecraft production standard

Read this before creating or modifying a video project. This is the authoritative production handbook. The renderer remains HTML/CSS/JS/SVG through the current runtime and Remotion; it is not an animation-quality oracle. Legacy `snap`, `render`, `validate`, `review`, `hash` and `studio` still work without production contracts.

## 1. Brief before pixels

Identify the audience, one intended message, delivery context, references and their relevant qualities, narrative, constraints and review authority. Explain what the viewer should understand or do afterward. Distinguish client direction, inference and an original exercise. Do not invent testimonials, metrics, identities or product capabilities. A desktop simulation is labeled as such.

Use `production/brief.json` (schema version 1; [JSON Schema](../schemas/production-brief.schema.json)) inside the selected project. `production/plan.json` records executable beat/event mappings. Project and scene manifests remain the single authority for dimensions, FPS, shot lengths, cuts and actual audio. Do not copy those values into the intent brief. Run `bun run production check --project projects/<id> --scene <scene>` to validate both contracts against those manifests.

Choose the composition, type, palette and motion language for this message, not an inherited template. Document why the typeface fits and verify the actual local font loaded. Ensure non-Latin coverage when needed. Use readable sizes, contrast, line length and reading holds at delivery resolution. One focal point leads each beat; typography, spacing and depth establish hierarchy. Window chrome, labels and content need coherent scale, not oversized dashboard cards. Keep margins, baseline rhythm, accent meanings and surface materials consistent across shots.

References are observations, not assets or permission to copy. Keep fonts and assets local, licensed and documented. Optional starting points are in [production-templates.md](production-templates.md); none replaces a brief.

## 2. Script to frame plan

Write the message as a sequence of visual beats before animating. Each plan beat has a stable ID, shot ID, shot-local half-open `[startFrame,endFrame)` range, script, visible state, motion and purpose. Each semantic event has an ID, beat/shot ID, local frame, type, visible causal description and explicit sound intent. Derive scene frames using the existing shot start offsets. Boundary frames, press/release, first/last letters, grab/drop, layer changes, camera start/stop and transitions deserve review captures.

Do not duplicate an executable audio track in the plan. `event.audio.cueId` points to the existing **resolved** scene cue ID (`shot:cue` for shot-local cues). An audible event starts its cue at the exact derived scene frame. Planned required events must resolve to positive-gain actual cues and registered local assets. Every actual cue must have an event and provenance; unavailable audio is a failure, not permission to substitute a beep. The generated permanent cue sheet joins semantic event, intended reason, actual asset, trim, duration, gain, fade and final scene position.

Use integral frames and half-open ranges consistently. An event at a shot's duration is outside that shot. A release is distinct from a press. A planned quiet interval cannot intersect a cue. Assets record SHA-256, category, author, license and a reproducible recipe or exact licensed source. Recheck contracts after any timing or source change.

## 3. Motion principles, applied

- **Purpose:** each movement guides attention, shows causality, reveals structure, preserves continuity or communicates a state change. Remove movement with no job.
- **Timing:** plan preparation, action, response and reading time separately. A fast accent is not a substitute for a readable hold. Preview at delivery FPS and real-time speed, not just scrubbed stills.
- **Easing:** choose acceleration for the object's implied mass and input. Small UI response can decelerate quickly; a camera needs a smooth stop. Linear movement is useful for constant-rate mechanisms, not the default cursor. Avoid a universal elastic preset.
- **Staging:** make the cause visible before the effect. Reduce competing movement during a key action. Establish spatial relationships before zooming into them.
- **Anticipation:** let a cursor approach and settle; allow a small preparation where physical action warrants it. Do not add a decorative backward twitch to every object.
- **Follow-through:** a dropped or released object may settle subtly if its material warrants it. UI windows do not wobble like rubber. Stop input-led motion at release.
- **Overlap:** subordinate details may trail a primary action. Offset by causal relationship, not a repeated stagger recipe. Never overlap two competing reading tasks.
- **Continuity:** stable anchors, scale, axis and visual identity survive cuts. A match cut should preserve the relevant shape or action. Hard cuts are valid; transitions are not mandatory.
- **Camera:** motivate a move by attention or narrative, establish its subject, use a stable pivot, protect crop/safe margins, and settle before reading. Do not zoom constantly, move against the cursor's intention, or hide broken layout with a crop.
- **Style:** select a restrained physical vocabulary for the whole piece. A documentary, desktop and kinetic title need different rhythms. Do not combine bounce, floating, glow and whip-pan by default.

All shot state is an absolute function of the requested frame. Follow `AGENTS.md` for seekable CSS/WAAPI/GSAP. Test middle → first → middle, critical boundaries and late → early states. Timers, live network results, previous DOM state and wall-clock playback cannot determine pixels.

## 4. Desktop interaction credibility

Establish a believable desktop: menu bar, coherent window chrome, content geometry, consistent control sizes, active/inactive states, clipping, focus, and stacking. Show actual task content rather than gray skeletons or generic floating cards. Simulated controls belong to a scripted video, not a claimed working application.

Cursor paths should approach the intended hit target with plausible acceleration, modest curvature, a settling pause and occasional task-driven hesitation. Avoid random jitter, constant speed, teleports, center-to-center straight lines everywhere or motion while the viewer is reading. Keep the visible cursor hotspot aligned with its coordinate. A cursor press may compress subtly without moving that hotspot.

Press starts the pressed visual; release triggers the click response when appropriate. A grabbed title bar activates/brings forward its window. Preserve the cursor-to-window attachment offset throughout the drag. The window follows the pointer, not the other way around. Release ends the drag; the drop/settle belongs to the release, not several frames earlier. Layer order must stay believable through occlusion. Focus moves only from a visible input/keyboard action and is cleared coherently; do not type into an unfocused field. Typing cadence should vary and allow a final confirmation/read pause. Keep text sharp and within its intended control.

Capture the contact frames and both sides of every state change. Inspect the cursor tip against the target, window bounds, relative grip offset, focused input, trailing/release frame and post-action hold. Real-time/sequence inspection is required for judging a trajectory; three stills alone cannot prove natural motion.

## 5. Sound is event design

Narration is **off unless explicitly requested and authorized**. Music is **off unless explicitly authorized**. Do not introduce either because the film feels empty. Meaningful tactile interactions must be considered for SFX; deliberate silence is a valid documented design, not a missing asset. `audio.sfx: silent` requires a reason and no actual audio cues. `required` needs required events, nonzero matching cues and a decodable final audio stream.

Local categories: mouse/button press, release, key/contact, grab, surface friction/drag, drop/settle, paper/transition accent, ambience, voice and music. Last three are not automatically appropriate. Original synthesis is allowed: use seeded broadband transients, damping, friction envelopes and material resonances, not a repeated pure-tone notification. Retain the generating script and exact parameters. Licensed assets must state author/source/license, permitted redistribution/modification and local file hash. Do not fetch audio at render time.

Match timbre and scale to the physical implication: press and release are different; a light title-bar grab is not a cinematic impact. Friction follows the movement envelope and stops at release. A drop can have a short body and subtle secondary contact. A transition accent supports a motivated change, not every camera frame. Vary meaningful repetitions by original variants, dynamics, material or recorded performance. Avoid mechanically repeating an identical click, random pitch shifts unrelated to action and generic electronic beeps.

Align source onset and destination event deliberately; version-one contracts use exact scene-frame starts. Trim dead air from assets, use short attack/release envelopes, and avoid discontinuities at cuts. Use the existing manifest gain/fades/loop fields, not HTML audio. Keep a cue sheet. Mix conservatively: production rejects a summed manifest gain envelope above 0.9. This is a worst-case headroom check, not a loudness standard. Each final decoded channel's peak must remain below 0.95 full scale; stereo-energy quiet intervals and signal presence are checked. Review stereo balance separately when spatial audio matters.

Listen to the complete exported film at normal speed and a sensible playback level, then isolated critical moments. Judge realism, harshness, repetition, balance, masking, fatigue, silence and sync against the picture. Check leading/trailing quiet, transitions and cut tails. Measurements and waveform correlation detect missing, shifted or clipped audio but **cannot certify pleasantness or realism**. If no listening tool or human is available, explicitly record `measured` and listening pending; never say it was heard. No automatic human approval.

## 6. Iteration and anti-pattern correction

Work blocking → refine → sound → review → correct → verify. Blocking establishes narrative and spatial causality; refinement adds timing/type/detail; sound is planned early but mixed against stable action. Inspect retained images and motion evidence, record defects precisely, correct their cause, recapture and recheck. Iterate until acceptance criteria are met or report the blocker. There is no arbitrary required revision count, and no invented defects merely to claim iteration.

| Anti-pattern | Corrective action |
| --- | --- |
| Same fade-up/bounce on every element | Assign each movement a purpose; remove or change it to fit the action. |
| Cursor arrives after a button reacts | Fix the shared event frame; capture precontact, contact and response. |
| Window drifts away from a grabbing hand | Preserve the grip offset and finish motion at release. |
| Decorative camera hides unreadable text | Fix type/layout, reduce camera travel, add a settled reading hold. |
| UI cards float without a desktop model | Establish chrome, task content, z-order, clipping and focus. |
| Text types at constant machine cadence | Use a documented variable cadence with focus/confirmation and pauses. |
| Every event plays the same beep | Design local material/contact variants or choose deliberate silence. |
| Sound precedes the physical cause | Fix event-to-cue mapping and remeasure final encoded sync. |
| Required sound replaced by a silent track | Fail the gate: verify actual cue correlation and final decoded energy. |
| Passing validation called beautiful | Separate technical results from named visual/motion/sound judgment. |
| Capture called approval | Open the images; record observations, reviewer, decision and limitations. |
| Old PNG links survive cleanup | Archive hashes/frame descriptions/final-video times before deletion. |

## 7. Independent gates and truthful labels

**Gate A, technical:** valid project/scene/brief/plan, local decodable assets/provenance, bounded events/cues/gains, successful renderer completion, no browser errors, unchanged source, valid review PNGs, full MP4 decode, exactly one H.264/YUV420 video stream at expected dimensions/rate/frame count/duration, expected AAC audio stream presence (none for declared silence), decoded levels, planned cue correlation/alignment and quiet checks. Stream/container tolerances allow normal AAC padding, not truncated video. This gate does not judge composition or realism.

**Gate B, creative:** a named agent or human opens every planned capture, checks action sequences/real-time motion and records observations, severity, scene/shot/local frame, correction, disposition and limits. The review is bound to source and candidate hashes. Open blocking/major findings prevent publication. Sound measurements and subjective listening are distinct. An agent review with unavailable listening is partial, and its delivery label remains `technically-verified`, not fully `agent-reviewed`.

**Gate C, editorial:** a human approves when the brief requires it. The automation never supplies a person's name or upgrades an agent to human. Required missing approval blocks publication; otherwise editorial status is `not-required`, never implicitly `approved`. Human claims require a human-authored review, not an automatically generated flag.

The production report exposes all three states. A technically verified, visually inspected deliverable may be published with listening explicitly pending when human approval is not required; this permits safe technical delivery, not an aesthetic guarantee. `human-approved` is reserved for recorded human approval with completed creative review. `agent-reviewed` requires complete agent motion and listening review. Source changes invalidate prior acceptance.

## 8. Commands, permanent evidence and cleanup

```sh
bun run production check --project projects/<id> --scene <scene>
bun run production prepare --project projects/<id> --scene <scene>
# Open every listed preview and inspect motion; write the named review at the printed report path.
bun run production publish --project projects/<id> --scene <scene> --run <uuid>
bun run production cleanup --project projects/<id> --scene <scene> --run <uuid>
```

The CLI is anchored to this repository; it has no arbitrary output/cleanup-root flag. Unique runs live in `output/<project>/.work/<uuid>/`. Only explicitly registered scratch media is disposable: PNG/JPG previews, draft MP4, intermediate WAV/MP3 and test captures. File suffixes alone never confer ownership. Metadata, logs, cue sheets, annotations and reports live permanently at `docs/production-runs/<project>/<uuid>/`, never in the final delivery directory. Legacy renderer-owned bundle/partial lifecycle stays unchanged and has its existing tests.

After successful verification, archive capture SHA-256, shot/local/scene frame, description and final-video time; remove links to disposable PNGs in permanent evidence. Save review findings and verification metadata first. Publish the verified draft by an atomic, no-overwrite same-filesystem hard link to `output/<project>/final/<scene>-<uuid>.mp4`; cleanup later unlinks the owned draft. Reverify that exact published file before authorizing cleanup. Existing final exports are never overwritten. Reclaimed bytes count removed temporary file lengths, not physically freed disk blocks (the draft and final initially share storage).

Cleanup checks its permanent ledger, run/project identity, final hash/media attestation and canonical containment. It refuses links (including parent links), traversal, special files and protected documentation/source types. It deletes only individually registered, byte/hash-matching current-run files, never a broad recursive tree. Unknown files, changed files and previous runs are preserved and reported. Empty directories may remain. Repeated cleanup reports zero additional deletions. No `git clean`, age sweep, extension sweep, project deletion or arbitrary caller-provided root is allowed.

Render, verification or review failures retain scratch and permanent diagnostics. Interruption can leave a run for diagnosis; it must not silently resume publication or infer ownership. Publication and cleanup are distinct stages: cleanup failures never erase a verified final. A post-publication retry uses the saved ledger and final hash. Do not weaken the legacy `review --check` image-retention contract: production's archived evidence is a different explicitly marked format, not a legacy manifest pretending its PNGs still exist.

The delivery report must give exact export path/bytes/hash, video/audio checks, gate states, source/capture provenance, actual temporary files removed and bytes reclaimed, unknown/changed files preserved, diagnostics and failed/skipped checks. Attach the final MP4. Never invent reclamation counts or call pending work passed.
