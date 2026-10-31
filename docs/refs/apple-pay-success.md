---
archive: false
search:
  exclude: true
---

# Apple Pay success feedback

Apple's [web Apple Pay walkthrough](https://developer.apple.com/videos/play/tech-talks/111381/) describes the payment sheet changing to a checkmark and dismissing after success. Its [motion guidance](https://developer.apple.com/design/human-interface-guidelines/motion) describes animation as a way to communicate feedback and state. These sources do not specify the timing, easing, overshoot, or ring expansion for this design. Any implementation values are design choices tuned by eye, not measurements of Apple Pay.

## v3.2 implementation

The magnifier's lens remains in place while its handle retracts, a check is drawn, and a single ring expands. The 320 ms press (`.92 → 1.08 → 1`), 180 ms handle retraction, 220 ms check delay, 250 ms check drawing, and 520 ms light ring are locally tuned design values, **not measurements of Apple Pay**. Apple’s [feedback guidance](https://developer.apple.com/design/human-interface-guidelines/feedback) calls for clear confirmation and its [Tap to Pay guidance](https://developer.apple.com/design/human-interface-guidelines/tap-to-pay-on-iphone) identifies a completion checkmark; neither provides these timing values.
