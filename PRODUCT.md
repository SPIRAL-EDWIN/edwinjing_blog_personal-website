# Product
<!-- impeccable:product-schema 1 -->
## Platform
web
## Purpose and users
Chen Jing's public working notebook: readers looking for robotics notes, practical experiments, coursework and experience sharing. The academic profile lives separately at edwinjing.github.io.
## Stack
Existing MkDocs + Material; Python content hooks; same-origin fonts; one custom CSS entry and existing EdwinOS runtime.
## Constraints confirmed by the user
Local redesign only; no push. Preserve fonts/type scale, liquid-glass material, and exact footer/visitor badge. English homepage except the author's Chinese name. Real robot footage and real notes; no invented results. Responsive, accessible, reduced-motion and Save-Data support.
## Evidence
Authored notes under docs/OsdNotes and docs/经验分享; Archive activity metadata; user-supplied Diffusion_01.mp4 processed into local video/poster. Header and search remain shared with reading pages.
## Current workflow
Three separately revertible changes: editorial homepage/video; reusable glass; optional first-visit intro with skip and hard timeout. Preview at localhost:8000. Confirmed requirements come from the user's full October 29 brief, not an inferred brand interview.
