# Production cue sheet

Scene frames are authoritative; intervals are half-open.

| Event | Shot:local | Scene frame / seconds | Intent / purpose | Cue / local asset | Trim / length | Gain / fades |
| --- | --- | --- | --- | --- | --- | --- |
| press-new (press) | workspace:54 | 54 / 1.800 | required: Dry light mechanical down-contact, not a notification. | open-press / assets/audio/open-press.wav | [0,3) / 3 | 0.3 / 0,1 |
| release-new (release) | workspace:57 | 57 / 1.900 | required: A thinner, distinct up-contact follows the visible release. | open-release / assets/audio/open-release.wav | [0,3) / 3 | 0.25 / 0,1 |
| rename-focus (focus) | workspace:57 | 57 / 1.900 | silent: The release already conveys causality; another focus chime would be redundant. | deliberate silence / unavailable optional cue | n/a | n/a |
| type-name (type) | workspace:96 | 96 / 3.200 | required: Eleven original varied key contacts share the exact visual cadence. | typing / assets/audio/typing.wav | [0,52) / 52 | 0.27 / 0,1 |
| name-complete (reveal) | workspace:145 | 145 / 4.833 | silent: The last contact is already part of the mapped typing performance. | deliberate silence / unavailable optional cue | n/a | n/a |
| confirm-name (confirm) | workspace:159 | 159 / 5.300 | required: A slightly lower keyboard contact resolves the naming action. | confirm / assets/audio/confirm.wav | [0,4) / 4 | 0.28 / 0,1 |
| press-title (press) | workspace:212 | 212 / 7.067 | required: A separate original down-contact, not a repeat of the first click. | grip-press / assets/audio/grip-press.wav | [0,2) / 2 | 0.27 / 0,1 |
| grab-title (grab) | workspace:214 | 214 / 7.133 | required: A low dry contact suggests a light grip before movement. | grab / assets/audio/grab.wav | [0,5) / 5 | 0.26 / 0,1 |
| drag-window (drag) | workspace:220 | 220 / 7.333 | required: Quiet filtered surface friction follows the drag envelope, with no sustained tone. | drag / assets/audio/drag.wav | [0,67) / 67 | 0.32 / 2,2 |
| drag-stop (reveal) | workspace:286 | 286 / 9.533 | silent: The friction envelope is already ending; no extra stop sound. | deliberate silence / unavailable optional cue | n/a | n/a |
| release-title (release) | workspace:288 | 288 / 9.600 | required: A distinct up-contact ends the grip. | grip-release / assets/audio/grip-release.wav | [0,2) / 2 | 0.22 / 0,1 |
| drop-window (drop) | workspace:290 | 290 / 9.667 | required: A restrained low material contact and small secondary tap complete the gesture. | drop / assets/audio/drop.wav | [0,8) / 8 | 0.29 / 0,2 |
| camera-attention (transition) | workspace:304 | 304 / 10.133 | required: A quiet paper-brush accent marks the change of attention, not continuous camera noise. | camera-paper / assets/audio/camera-paper.wav | [0,12) / 12 | 0.22 / 1,2 |
| camera-settled (reveal) | workspace:348 | 348 / 11.600 | silent: Silence protects the closing reading hold. | deliberate silence / unavailable optional cue | n/a | n/a |
| closing-hold (reveal) | workspace:370 | 370 / 12.333 | silent: Let the final thought breathe; no success beep, voice or music. | deliberate silence / unavailable optional cue | n/a | n/a |
