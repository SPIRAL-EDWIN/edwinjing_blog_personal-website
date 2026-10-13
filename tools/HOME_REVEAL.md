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
Selected Experiences and Honors. About Me, initially visible content and restored reading
positions stay static. Threshold zero supports sections taller than a viewport.
Viewed keys survive instant navigation within this document, with no persistent
storage; a new document can start a new first-scroll sequence. Hash/focus,
reduced motion, missing IntersectionObserver and no JavaScript stay readable.
No image sources, loading hints, preloads or browser cache policy change.

Run `node tools/test_home_reveal.cjs` and `.venv/bin/mkdocs build --strict`.
Browser checks should cover first descent, second descent, instant return,
restored refresh, hash landing, keyboard focus, reduced motion and Friends.
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
