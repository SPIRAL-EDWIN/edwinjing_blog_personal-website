---
archive: false
search:
  exclude: true
---

# Reference: scrollama

Source: https://github.com/russellsamora/scrollama

## Observation

README identifies IntersectionObserver for step detection, ResizeObserver support, CSS sticky for pinning, custom offsets and destroy cleanup.

## Application

Borrow: explicit steps, resize and lifecycle cleanup. Avoid adding a second competing observer to existing lifecycle without need.

## Evidence limits

Library documentation examined; not a measured live page. Offset range 0–1 is documented, not an observed site setting.

No third-party code, images or footage was incorporated. A 1440×900 scroll recording and step screenshots were not collected for this reference; numerical timeline parameters are intentionally not inferred.
