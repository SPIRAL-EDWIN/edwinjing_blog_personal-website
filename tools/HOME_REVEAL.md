# Overview first-scroll reveal

Reference checked on 2026-10-13: https://tianxingchen.github.io/.
Its inline script matches the earlier local source snapshot byte for byte;
the full HTML has changed (current SHA-256
`b25847b4255b7d0f1cbd56ef00878f325662fb15c70077afcc5469463449477b`).
Reference CSS uses a 16px upward fade over 800ms. Its IntersectionObserver uses
threshold .06 and bottom margin -30px, adds `visible`, then unobserves the node.

REA analyzed the verbatim extracted inline script as inert source:
`ev_dfe0fff5faac78f09b7aa0d4458d0563605e732ef17aa9f128ebc20a221ce66a`
(summary `ev_7167ae290f063bcf45a9fe4c9509bb09e2e3fe79f9e557f5a37b43e66435d46c`).
It parsed one script / 2345 AST nodes, with 588 semantic unknowns; this is static
evidence, not proof of runtime behavior. The mechanism above was checked in
the original CSS/JS as well. A literal trace yielded no matches and is not used
as evidence that a callback ran.

EdwinOS applies the effect to Recent News, Education, Publications, Workshop,
Selected Experiences and Honors. About Me, initial content whose complete heading
is visible, and restored reading positions stay static. A partially visible
heading remains eligible for entrance. One observer watches headings for a full
intersection, with the existing 30px bottom margin, so section length does not
delay entry. Section boundaries in that same observer recover reading positions
whose heading has already passed; they do not start a normal entrance. Shared
thresholds are zero and one. This covers native restoration after pageshow that
jumps a short heading from below to above the viewport without intersecting it.
Viewed keys survive instant navigation within this document, with no persistent
storage; a new document can start a new first-scroll sequence. Hash/focus,
reduced motion, missing IntersectionObserver and no JavaScript stay readable.
No image sources, loading hints, preloads or browser cache policy change.
Initial viewport exposure remains provisional until reader scroll traversal.
Disclosure focus/scroll anchoring alone does not count as reading. If the reader
opens About's native Detailed Profile before scrolling, provisional sections
whose headings leave the readable viewport are armed for their actual first
scroll entry. Automatic viewport entries stay provisional until their entrance
transition finishes or reader scrolling confirms them; focus positioning just
before disclosure must not consume that first entrance. Completed entries and
repeat disclosure toggles never replay.

Run `node tools/test_home_reveal.cjs` and `.venv/bin/mkdocs build --strict`.
Browser checks should cover first descent, second descent, instant return,
restored refresh, hash landing, keyboard focus, reduced motion and Friends.
Include Detailed Profile opening before first scroll at narrow, ordinary and tall
viewport heights, partially visible News headings and native summary auto-scroll,
plus repeat toggles after browsing; an initially empty pending
set must not discard the disclosure listener while provisional sections remain.
The UI equivalence checker uses reduced motion by default and validates settled
geometry; it does not measure the animation's intermediate frames or prove a
network speed improvement.

Verified locally: 127 Python regressions, reveal lifecycle/navigation/Top tests,
and strict build pass. The settled CSS comparison passes all 8 Overview/Friends
scenarios (1280/375px, light/dark, reduced motion). Actual browser checks confirm
the first viewport stays static (desktop Header 70px, Profile 260px), later
sections enter with transition states, a second descent stays opaque at final
geometry, instant Friends→Overview retains viewed state, and a mid-page reload
restores the same scroll position with visible reading content.

Detailed Profile regression checked on 2026-10-16: at 433x773, News originally
spanned y=749.58..790.42, so only part of its heading fitted. It now remains
pending. Both a direct click and automatic summary positioning (scrollY=330.5)
followed by expansion preserve the first entry; an actual descent reveals News
and then each later section. At 1280x720, News/Education are initially static,
while the partially visible Experiences heading waits. Expanding the profile
rearms unread initial sections. The desktop Header remains 70px and Profile
260px wide; Friends uses the same settled geometry and returning to Overview
keeps viewed sections visible. Unit regressions also cover completed versus
interrupted automatic entries, stale transition/observer events, all sections
initially visible, native restoration, late pageshow, keyboard scrolling and
listener cleanup. The strict build and reveal/runtime/navigation/glass checks
pass.
The final browser pass also confirms that repeated disclosure toggles and a
second descent stay opaque at final geometry. Reloading near scrollY=1904
restores visible Workshop/Honors body content directly, including the late
native restore that previously skipped Workshop's short heading.
