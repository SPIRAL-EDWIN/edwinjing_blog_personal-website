---
name: figure-to-animation
description: Turn a supplied diagram or licensed figure into a structured, accessible static and scroll-animated visual; use for image-to-FigureSpec workflows, not for creating unrelated scientific plots.
---

# Figure to animation

## Rights gate

Identify the exact figure, paper version, creator, license and intended audience before making a public adaptation; record the evidence and decision in `docs/figure-licenses.md` or the project equivalent. Animation, recoloring, and a redraw following the original composition count as adaptations for this workflow. CC BY, CC0 and public domain may be used with the required attribution; CC BY-SA additionally requires compliance with share-alike. For CC BY-NC ask the user whether the intended use is noncommercial before publishing. For CC BY-NC-ND, all-rights-reserved or unclear rights, publish no adaptation; offer a citation and link, or create an original composition explaining the underlying idea if requested. Attribution alone does not permit prohibited adaptations. When in doubt ask. This is a safeguard, not legal advice.

Private training material and all derivatives must remain outside the static source and deployment output in an ignored directory. Verify the production artifact, not just the source path. Never use a private replica as a homepage asset. Record ownership of original work too.

## Workflow

1. Examine the source, its caption and surrounding explanation. Separate observed elements from guesses; preserve uncertain relationships as unresolved instead of inventing facts. For original work, check the source notes.
2. Describe elements in a FigureSpec using `references/figure-spec.schema.json`: named layers, nodes, edges, highlights, callouts, ordered steps and reading order. Run `scripts/validate_spec.py SPEC.json`. It checks both schema-like structure and referential integrity; it does not establish scientific correctness.
3. Render a static end state first using vector edges and readable text. Compare against the source when a faithful recreation is authorized; for original work compare against the underlying facts, not the source's composition. Confirm shapes, direction, hierarchy, labels, contrast and legibility at target sizes.
4. Map reading order into a timeline; stage entry, meaningful highlights and directional flow should correspond to the explanation. Use an accessible static end state without JS and with reduced motion, keyboard-operable controls, descriptive caption and text equivalents. Avoid motion-dependent meaning. For narrow screens remove pinning where it obstructs reading.
5. Record the whole scroll and capture 0/25/50/75/100% states with `scripts/capture_frames.cjs` (requires a project-installed Playwright and browser). Review rendered frames, not just source. See `references/qa.md` for review and failure modes. Check browser support and lifecycle teardown. Document actual observations, not inferred results.
