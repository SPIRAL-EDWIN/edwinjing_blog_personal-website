# Local homepage review — 2026-10-30

Preview: http://127.0.0.1:8000/ ; replay opening: http://127.0.0.1:8000/?intro=1
Blog only, branch `codex/redesign-home`. No push or production deployment. Academic homepage untouched.

## Result

A: one primary reading action, one secondary text link, simpler dated updates, asymmetric
Start Here group, and portrait media without dead black sidebars. No internal ↗
or duplicate card links. Source typography and exact footer markup preserved.

B: transparent rounded controls and Start Here surfaces reuse EdwinOS optics.
Neutral highlights replace blue hover rims. Start Here retains only the subtle
grid; its blue/cyan glow was removed. Opening styling remains independent. Chromium enables displacement with restrained
RGB dispersion; Safari uses native blur/highlights. No new framework/font/CDN.
All homepage links suppress underlines; keyboard focus outlines remain.

C: first-entry opening rises/bobs, breathes and gently tilts during typing, draws
a confirmation, sinks, then reveals the page top to bottom. No skip UI/gesture.
Real readiness covers fonts, essential visible local images and active media
metadata. External badges/avatars cannot hold it. Default per-tab session;
reload/instant navigation do not replay. Independent seven-second failure exit.
Reduced-motion avoids typing, bobbing, tilting and curtain motion.

Latest refinements: single portrait player with Rollout / Board / Banana glass
choices. Controls below footage never cover source captions. Hover plays on fine
pointers; touch/keyboard use explicit controls. Offscreen/hidden pauses. Save-Data
makes zero initial MP4 requests. Only the selected clip gets a source. See
media-source.md for original IDs, trim ranges and derivative hashes.

32 English questions are randomly shuffled each opening; no repeat within an
opening, no extra wait added to expose more questions. Sources span robotics,
PHIL 206 and CS101. See intro-notes.md for question-by-question provenance.

## Copy for Edwin's review

Hero: “Notes from the lab, and the work between.”
Byline: “Chen Jing (经宸) · Working notebook”
Introduction: “I’m Chen Jing. This notebook follows my work in robotics:
coordinate transforms, simulation checks, reward tuning—and the tools I use
along the way.”
Hero actions: “Browse the notes”, “Lab notes & experience”.
“Academic homepage” now lives in the shared header, as text on desktop and a
labelled school icon on narrow screens. GitHub is icon-only in the header.
Section headings: “Recent Updates”, “Start Here”; archive action: “View archive”.

- “Connecting camera and robot” — “Follow the coordinate frames, solve AX = XB, and check what a calibration actually tells you.”
- “From Isaac Lab to MuJoCo” — “ONNX exports, joint order, and deployment checks for a policy running in a second simulator.”
- “Git, without losing the thread” — “Branches, forks, and pull requests: a reference for everyday collaboration.”

Removed repetitive UPDATED labels, generic card eyebrows, nested Read links,
internal external-link arrows and isolated language/footer-link boilerplate.
Article bodies, facts, dates and English title mapping remain authored sources.
Video labels: “Autonomous rollout / Source footage · 5× speed”, “Board wiping /
Lab footage · original speed”, “Banana grasp / Lab footage · original speed”.

## Evidence and verification

- Strict MkDocs build passed. `tools.test_home_sections`: 22 tests passed.
- Edge: 375/768/1440 × light/dark, no horizontal overflow or JS errors.
- Final regular-page local LCP: 68–112ms; CLS: 0.000008–0.000065. Baseline
  local LCP 64–144ms, CLS0. This is unthrottled local evidence, not a production
  performance guarantee. Tiny remaining shifts are control-label updates.
- Mandatory opening intentionally delays reading ~4.5s, even on a fast local
  load. Do not describe it as faster LCP. Watchdog test: 7003ms, no inert leftovers.
- No-JS content remains visible; missing intro runtime fails open. Friends and
  direct article entry verified. Configuration off/always/home-only/local tests
  passed. Random-pool test verifies diversity and maximum58 characters.
- Desktop hover/leave, touch play/pause, rapid clip change, Save-Data and reduced
  motion tested; both new clips decode480×854. No inactive-clip requests.
- Footer authored block is byte-identical to baseline (SHA1
  5f9c141dd15d423f3a27c2479aaeabcef175ee40).
- Native Safari light-mode first screen and Start Here inspected; screenshot
  `safari-start-here-light.png`. Safari dark-mode automation did not establish a
  successful theme change, so do not claim full native Safari theme coverage.
- `review-*.png`, `review.json`, `media-results.json`, `intro-results.json`,
  `intro-flags.json`, `question-results.json` retain the local test evidence.

## Research and tooling limits

Impeccable4.8 installed locally and used for context/critique/layout/motion/polish.
Codex restart/hook approval not performed or claimed. Source detector before and
after: same10 primary findings in existing shared CSS (7 font/3 side borders).
User explicitly retains fonts; unrelated components were not changed to silence
warnings. Added2 advisory findings correspond to requested elastic motion/grid.
Regex scans do not evaluate contrast or DOM. Original URL detector timed out;
this is not represented as a clean rendered audit. Independent QA reviewed runtime;
initial independent design critique was unavailable due account quota, documented
in critique-before.md.

Ricky reference: https://rickyzhang.me/ . REA inspected shipped DOM/scripts/network
(evidence ev_168823f5b8682e3fa08090c1ab6222f205d64027de33157a94ba6cae23ecfa4c).
The inspected page had no video element. We borrowed object depth/tilt, not a
claimed reconstruction of a Ricky video-player implementation.

Apple demo: https://applepaydemo.apple.com/ and
https://developer.apple.com/videos/play/tech-talks/111381/ . Static demo inspection
only shows payment completion callbacks, not native animation parameters (REA
ev_b049772499ca9e1b70cf0b61a94ea955490c3e31b8cd6744861509598bc04e74).
Confirmation timings are self-tuned; no payment or transaction was performed.

WebKitGTK CSS-variable bug289800 is not evidence that all Safari versions reject
CSS variables. Native prefixed blur values are still supplied as a fallback.
No third-party glass implementation was copied; existing EdwinOS optics extended.

## Maintenance/review decisions

- Review visual motion strength and selected clip excerpts in the local page.
- `extra.loader` controls opening behavior. Prompt text lives independently in
  intro-questions.js; preserve actual-source provenance and conceptual value.
- `preload=metadata` is a browser hint, not a guaranteed byte limit.
- sessionStorage may be cloned by browser-created opener tabs; normal/noopener
  tabs are independent. No global window.open patch is installed.
- A/B/C have independent commits; subsequent media/polish and prompt expansion
  are separate follow-up commits. No commit contains original large MOV files or
  unrelated photography assets.

## Header follow-up — 2026-10-30

- Shared header GitHub name/statistics omitted at render time; drawer facts retained.
- Academic homepage moved from hero to existing glass system in the header.
- Fixed search/GitHub/palette spacing; narrow navigation retains horizontal scrolling.
- 320/375/768/1024/1440 checks across Home, Friends and ENotes: no page overflow or runtime errors.
- Light/dark visuals, search opening/closing and Friends-to-Home replacement checked.
- Strict build passed; current preview remains on port8000. Local only, no push.
