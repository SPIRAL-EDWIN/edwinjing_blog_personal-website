# First-visit intro: implementation and evidence

## Scope

Implemented only in the blog. Standalone runtime `docs/javascripts/intro-loader.js`,
authored question data `docs/javascripts/intro-questions.js`, and one template partial
with head/body phases. Trigger settings are `extra.loader` in `mkdocs.yml`.
No route hook; the existing cross-document navigation coordinator is untouched.

`window.EdwinOSIntro.showLoader({reason, until: Promise})` is an explicit optional
entry point; its returned Promise reports `reason`, elapsed time, and resource
outcomes. `window.EdwinOSIntro.dismiss()` provides cancellation. The timer starts
in the head, not when the late runtime finally executes. A missing/broken runtime
therefore still fails open at 7 seconds. The shell has a native `hidden` fallback.

## Question provenance (actual body content reviewed)

1. “How to fill the gap between sim2sim and sim2real?” — user-required wording;
   Sim2Sim article describes evaluating the same trained policy in MuJoCo after
   Isaac Lab, with deployment-compatible inference inputs/exports.
2. “What changes when the same policy meets another simulator?” — same article,
   opening definition: stability, errors, robustness and deployment consistency.
3. “Does your exported model match the checkpoint you tested?” — same article,
   checkpoint/ONNX distinction: training does not automatically refresh exports;
   export and deployment synchronization must be checked.
4. “Which coordinate frame is your robot actually following?” — hand–eye article,
   base/flange/camera/board relationships and inverse transforms.
5. “Why can more calibration poses still give a worse result?” — hand–eye article,
   explicit warning that redundant/degenerate samples and outliers mean more
   poses do not guarantee monotonically improving accuracy.
6. “Where is the gripper tip relative to the flange?” — hand–eye article's TCP
   section: flange coordinates are not the grasp center; calibrate or use CAD.
7. “What belongs in a branch, and what belongs in a fork?” — Git with gh article,
   branch vs fork distinction and contribution workflow.

Sources:
- `docs/经验分享/Phi Lab/WBC/Sim2Sim配置与训练.md`
- `docs/OsdNotes/Embodied AI/【Hand-Eye Calibration】 手眼标定理论与实践.md`
- `docs/OsdNotes/Github学习笔记/Git with gh.md`

No factual answers or new research claims were added. All 32 questions are under 60 characters. Per the latest decision, every opening starts at random using Fisher–Yates; rounds within the same opening do not repeat.

## Motion / constraints

Apple-style confirmation is an original approximation, **not** a measured Apple
Pay animation. Circle: 280ms; tick: delayed 110ms, drawn 240ms; green at confirmation
start; scale .94 → 1.08 → 1 over 480ms. Cubic bezier `.22,.61,.36,1` for drawing.
The latest user steering supersedes the original skip requirement. Entry now
rises for 720ms, overshoots slightly and settles; typing gently breathes with a
per-round random tilt bounded to ±0.55 degrees. After the confirmation settles,
the box sinks for 420ms and a 580ms top-to-bottom curtain exposes the real page.
The absolute 7000ms cap still begins in the head. Reduced motion removes the
bobbing, typing, tilting, stroke and curtain animations.

Resources: fonts.ready, visible same-origin content images, selected video poster
and metadata. External Friends avatars and visitor badges never gate entry.
Save-Data suppresses metadata source assignment. Image/metadata failures and
timeouts are not labelled ready. The intro does not request inactive clips;
metadata is a browser hint and cannot guarantee a maximum byte count.

The DOM remains rendered and indexed. Inert siblings and wheel/touch interception
hold the opening without removing scrollbars or changing page dimensions. There
is no skip button or key/click dismissal. The 7-second watchdog and public dismiss
API provide failure recovery. No-JS displays the normal content.

## Explicit trade-offs / review points

- A compulsory first round delays reading by ~4.5 seconds even if resources
  are ready. Do not present it as a page-load performance improvement. Measure
  rendered LCP/CLS separately; a decorative modal may change the LCP candidate.
- sessionStorage behaves per tab for normal/noopener new tabs. A new tab created
  with a live opener may inherit sessionStorage; browsers clone it. We do not
  mutate window.name or monkey-patch window.open to mask that platform behavior.
- The box mounts the shared `EdwinOSGlass` primitive at neutral
  geometry and destroy optics on every exit. CSS is handed to parent in `intro-styles.txt` for insertion in the single CSS
  owner. No stylesheet entry point is introduced by this module.

## Checks so far

- Node syntax check passed.
- MkDocs strict build passed (Node search-index fallback was informational).
- Edge runtime checks passed at 375/768/1440: no overflow, no JS errors, no skip, ready around 4.5 seconds. Reload/same-tab navigation skip the opening. No-JS and missing-runtime cases fail open. Friends retest after the same-origin guard: ready in 4527ms, zero inert leftovers.

## Impeccable motion pass

Read installed skill, ran its context command for the intro runtime, and read
animate/craft-floor references. As a delegated subagent with no user-question
tool, used the explicit brief and existing PRODUCT/DESIGN context. The brief's
mandatory first-visit sequence intentionally overrides the skill's preference
against page-load choreography on Read surfaces. Removed the unrequested label
above the search box; retained one focal moment, reduced-motion alternative,
the user-requested no-skip sequence and a bounded failure exit.

## Expanded question pool (2026-10-30)

Questions 8–12 derive from `Diffusion Policy checkpoint 数值与可视化评估流程.md`:
offline MSE is not robot success rate; trajectories reveal failure modes; episode
splits avoid neighboring-frame leakage; checkpoint comparisons keep evaluation
conditions fixed; rotation-6D MSE is not angular error.

Questions 13–15 derive from `Diffusion-policy-training中global steps和epoch的区分实例.md`:
step counting depends on the loop, batch size changes updates per epoch, and
prediction horizon changes effective sample count.

Questions 16–17 derive from `Gprogress的意义.md`: achieving new-best error differs
from maintaining low pose error, and progress gradually hands over to precision.
Question 18 derives from `【MDP】奖励函数解构学习.md`: the expected time-dependent
loco–mani gate and actual-distance gate serve different purposes.
Questions 19–20 derive from `Diffusion Policy数据训练流程.md`: measure data frequency
and pair recordings by identity, rather than file counts alone.

These are prompts to explore the notes, not new claims or reported results.
No extra animation rounds are forced just to show more questions.

## Philosophy and computing additions

Selection prioritizes a meaningful tension or distinction over a command lookup.
All are concise English adaptations, not claims that a philosophical position
is settled or that every explanation in a course notebook is authoritative.

| Questions | Source and author question/section |
|---|---|
| 21: knowing what we know | PHIL 206, epistemology priority; explicit “How do we know what we think we know?” |
| 22: observation and necessary cause | PHIL 206, Hume's induction and constant conjunction discussion |
| 23: perception vs illusion | PHIL 206, author's question about distinguishing illusion without permanent substance |
| 24: social contract and freedom | PHIL 206, explicit self-question “社会契约如何能够促进而不是减少自由？” |
| 25: general will vs private wishes | PHIL 206, General Will/众意 distinction and the taxation example |
| 26: criticism of progress | PHIL 206, paired self-questions about abandoning civilization and why Rousseau does not return to nature |
| 27: meaning of freedom | PHIL 206, freedom vs license and Redefining Freedom |
| 28: variable identity | CS101/Python, Lec7 mutable aliases and the nested dictionary example |
| 29: close enough | CS101/Python, floating-point comparison and isclose/allclose tolerances |
| 30: convergence vs best | CS101/Python, Lec18 local hill climbing and no guarantee of global optimum |
| 31: starting guesses | CS101/Python, Lec16 Newton example with two initial guesses |
| 32: fitting every point | CS101/MATLAB, Lec26 high-degree fitting, overfitting and spline discussion |

The course sources are `docs/OsdNotes/PHIL/PHIL 206.md`,
`docs/OsdNotes/CS101/Python.md` and `docs/OsdNotes/CS101/MATLAB.md`.
Questions 21, 23, 24 and 26 prioritize explicit self-questioning passages. Other
questions distill demonstrated conceptual issues; none is represented as a
verbatim personal question when it was authored here.
