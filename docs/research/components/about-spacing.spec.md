# About Me reading spacing

Inspected 2026-10-16. Reference: https://tianxingchen.github.io/.

## Evidence

REA `capture_browser_scenario` opened the reference's native Detailed Profile
at 1440 x 1000 in Edge, with reduced motion. Evidence:
`ev_60c49ea4eee49790d341958b16179abe52eaddb011709d19efc46c5a70cb1c14`.
The retained DOM hash is
`49eb13aab38796fe5c879038f11fa64a0d1f4e998174162ed945e959092e066e`.
The requested DOM capture completed without missing or truncated sections.

Observed reference CSS: `.intro-bio` uses 14px / 1.65; `.bio-detail` uses
13px / 1.7, with 8px between adjacent paragraphs and 12px below the summary.
Independent computed-style measurements confirmed 22.1px detailed line height
and 8px paragraph gaps. Mobile reference rules use 13.5px text.
REA retained the source and disclosure state; computed geometry was measured
separately with Playwright. This is bounded browser evidence, not coverage of
every device or the reference site's other components.

## Local adaptation

Use 14px text throughout About Me, preserving content, font families, colors
and native disclosure. The introductory paragraph uses 1.65 line height
(23.1px); detailed English/Chinese paragraphs and list items use 1.7 (23.8px).
The Overview Prose owner supplies inherited 14px / 1.65 defaults and 10px
paragraph gaps without forcing a size onto component paragraphs/list items.
About Me changes detailed leading to 1.7 and owns
lists' 8px block margins and 4px item spacing, and the
language divider to 12px margins with one neutral 1px border. Last blocks have
no trailing margin. The introductory paragraph has no bottom margin so its
flex parent cannot add 14.4px to the disclosure's existing 14px top margin.
The summary's typography, 12px body offset and entrance motion are unchanged.
This final balance follows reader review of an initial 15px / 1.6 version
with 8px paragraph gaps: the smaller text and more generous relative leading
avoid compressing larger glyphs into the reference's 8px paragraph rhythm.

The reference's publication footnote is 12px / 1.65, weight 400, with 16px top
spacing. Local contribution notes use those values. Other measured reference
levels include 13.5px / 1.5 news copy, 12-12.5px metadata and 11.5px awards.
These are role-specific references, not a blanket resize of every component.

Before adaptation, paragraphs had 14.4px bottom margins, lists 15px block
margins and 7.5px item spacing, and the divider 22.5px block margins. These
values came from intersecting homepage and Material defaults; no duplicate
stylesheet or runtime adjustment was needed.

## Verification

Compared baseline and candidate CSS against the same local HTML/runtime at
1440, 768 and 390px, in light and dark mode, closed and open. Computed values
match the local adaptation; no horizontal overflow, header/profile geometry
change, JavaScript page error or keyboard Enter/Space toggle regression.
Friends, ENotes Introduction and More Introduction paragraph styles match the
baseline. Screenshots were captured for desktop and mobile open profiles.
At 1440px, the complete open About section decreased from 1040.92 to 873.20px;
at 390px, from 1907.17 to 1654.28px, with unchanged text and 15px to 14px text.

The matrix uses Chromium/Edge with reduced motion. It does not establish
Safari/iOS or animation-frame equivalence; no runtime motion was changed.

## Prose ownership regression

The follow-up cascade migration preserves the approved About geometry, including
the 873.20px desktop and 1654.28px mobile open heights. Desktop/mobile light-mode
About screenshots are pixel-identical before/after this ownership change.
The CSS A/B checker covered homepage, Friends, Archive, both Introductions and
a long note at 1440/390px in both themes. Homepage flags are limited to intended
inherited container type; no geometry or screenshot differences were observed.
The other five routes have no computed-style, geometry or screenshot differences.
The first checker run was interrupted by a concurrent local rebuild after four
routes; the remaining two routes were rerun successfully against the finished
build. This is a bounded rest-state comparison, not full interaction coverage.

`tools/test_overview_typography.cjs` additionally covers six widths (including
768px and 680px boundaries), both themes, native About keyboard toggles, current
contribution notes and structural row type. Injected future prose/list/caption/
empty/award cases verify natural inheritance and ordinary component overrides
of font family, size, leading and paragraph margins without `!important`.
