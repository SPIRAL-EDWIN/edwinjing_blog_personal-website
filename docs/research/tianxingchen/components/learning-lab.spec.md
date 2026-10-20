# Learning Lab Specification

Target: `experiments/tianxingchen-lab/index.html`, `lab.css`, `lab.js`.
Reference: https://tianxingchen.github.io/
Source commit: b92ce6cd97835ce5a63028a37b0edc27eef02cfd.
This is a mechanism learning example, with authored sample content, not a full personal-site mirror.
Original source snapshot: `/private/tmp/tianxingchen-study/source/index.html`.

## Component ownership

One static page; scoped standalone CSS/JS. No dependencies, external fonts, external media, build tool, or changes to EdwinOS.
Use existing same-origin Outfit fonts if practical by linking a repository asset, with system fallback; do not copy assets or personal content from the reference.
Header, responsive hero, native details, eight-item News disclosure, and scroll-aware section links are in scope.
Add concise Chinese explanations for these features in the page itself because the page is a learning tool.
Title must clearly say 陈天行网页 · 机制学习示例. Link original website/source. Do not imply this is his official site.

## Reference measured styles (browser, 2026-10-13)

- Body font Outfit / Helvetica Neue / Arial / sans-serif; 15px; line-height 1.65; ink #121317; muted #45474d; blue #0b57d0.
- Background #fff; alternating section background #f8f9fc.
- Desktop 1440: wrap max-width 1120px includes 28px horizontal padding; x=160, content width=1064.
- Desktop header fixed at y=0, height 56px; transparent own background; isolation isolate; z-index 100.
- Desktop nav link gap 24px; font 13px; padding 6px 0; hover/active underline via scaleX(0→1), 1.5px high.
- Hero desktop grid columns minmax(0,1fr) minmax(240px,34%); measured 670.242px / 361.758px; gap 28px 32px; title 56px / 1.05.
- At 768: wrap padding 22px; content width 724; hero columns 468.32px / 231.68px, gap 22px 24px; title 42.24px.
- At 390: wrap padding 16px; content width 358; header 52px; hero one column; gap 18px; title 35.1px; reference portrait area 200x250px centered, ordered before prose.
- All three observed widths: no horizontal document overflow.
- Use a CSS-designed sample illustration in the portrait area; preserve this sample ratio rather than copying the person’s photo.

## Progressive glass: source lines 72–126

One non-interactive absolute sibling behind nav content, z-index -1; height nav-h + 52px; pointer-events none.
Five absolute inset-0 layers use backdrop blur, both WebKit and standard masks:
1. 3px; transparent 0% 38%, black 58% 70%, transparent 88% 100%.
2. 6px; transparent 0% 18%, black 36% 52%, transparent 74% 100%.
3. 10px; black 0% 28%, transparent 58% 100%.
4. 16px; black 0% 16%, transparent 42% 100%.
5. 22px; black 0%, transparent 22% 100%.
White overlay fade alpha .9 at 0%, .55 at 28%, .18 at 52%, zero from 78%.
No displacement SVG or animation loop for the glass. Visible text/colored sample blocks must scroll behind it so readers can inspect blur.

## Responsive mobile nav: source 3630–3653

At <=860px hamburger shown, nav links hidden until .is-open.
Links panel below nav, columns, 8px 18px 18px padding, 92% white +18px blur, max-height min(70vh,520px), overflow auto.
Click toggles nav .is-open and body .nav-open (scroll lock), aria-expanded and accessible Open/Close label.
Escape, link click, and resize above 860 close it. Restore focus on Escape when it was open.
At <=680: nav-h=52; wrap padding max(16px,safe-area-inset); title clamp(30px,9vw,38px).

## Scroll selection: source 3656–3695

Native hash anchors. Choose last target above scrollY + navH +28px, sort by document position.
At last 8px of document bottom, select final target.
Use passive scroll/resize and hashchange; in the demo coalesce measurements in requestAnimationFrame.
Reference html scroll-padding-top nav-h+16px may be used only in this standalone demo (not EdwinOS production).

## Disclosures

Native details/summary for detailed profile explanation; plus/minus from open attribute (source 1736–1792).
News: ten or twelve authored sample rows, eight initially visible. Toggle .news-expanded and Show more/less.
Improve reference accessibility by maintaining aria-expanded + aria-controls; document this demo improvement in README.
Avoid injecting dynamic HTML from arbitrary input.

## Reveals and safety

Optional reference reveal .8s, cubic-bezier(.2,.7,.3,1), 16px offset; observer threshold .06, margin 0 0 -30px 0; unobserve after first appearance.
Default content stays visible without JS; only enable reveal hiding after JS observer support checked. prefers-reduced-motion shows content and disables smooth scrolling.
No tracking, remote network, backend, or media lightbox in this small example.

## Acceptance

Local Python static server can serve page without package installation. No module/build pipeline required.
At 1440/768/390: no horizontal overflow, header 56/56/52, content widths 1064/724/358.
Menu open/close, Escape, native details, News expansion, and active links work.
No console errors, readable no-JS fallback, reduced-motion styles.
README explains scope, source attribution, deliberate sample content and improvements.
