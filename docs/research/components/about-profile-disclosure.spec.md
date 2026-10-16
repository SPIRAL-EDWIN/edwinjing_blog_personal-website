# About profile text disclosure

Reference: https://tianxingchen.github.io/, Profile summary, inspected2026-10-15.
REA retained capture: ev_25ace2e5da7f1713417d125a8f0d3de5ab3ca42c99f08dd959cd2f7891145d02.
Scope: homepage About disclosure only; preserve all text, links, section order and News.
Target files:docs/index.md and existing About Me owner in edwinos.css.

## Measured reference

Native details/summary, initially closed. Click/Enter/Space toggles native open;
no card, icon, chevron, border, fill or height animation.
Details margin-top14px, padding0, transparent background, border0.
Summary:Outfit font;11.5px;500;line-height18.975px(1.65);letter-spacing1.15px(.1em);
uppercase;rgb(122,126,135)(#7a7e87);padding0;margin0;min-height0;list-stylenone;
displaylist-item;cursorpointer;user-selectnone;transition:color .2s.
Hover text rgb(18,19,23)(#121317). Inline static ::before content '+ ', blue
rgb(11,87,208)(#0b57d0); open content '– '. No ::after.
Reference body margin-top12px. Reference mobile<=680px centers the summary;
desktop/tablet>680px left-align. Font size and spacing unchanged at all widths.

## Local adaptation and ownership

Remove note class, keep about-profile-details native element. This deliberately
opts out of existing callout JS. Do not change global Callouts CSS/runtime.
Wrap current detail body in about-profile-body for a12px top gap, no content edits.
Scoped About CSS must neutralize inherited generic details/summary card declarations
(background,border,radius,shadow,padding,pseudo masks/icons,minheight,position,arrow).
Use existing same-origin reading font for Outfit+CJK fallback; preserve body15px
reading typography and subtle language divider. Replicate reference exact light
summary colors; use existing academic-muted/accent/ink tokens in slate mode.
Keep visible keyboard focus (use scoped outline); native disclosure stays usable
without JS. Do not add another handler/store/animation. No news changes or push.

## Verify

Strict MkDocs build and diffcheck. Compare closed/open computed summary styles,
plus/minus and hover with reference. Test1440/768/390 in light/dark, no background
or border in either state, no callout runtime marker, no horizontaloverflow.
Keyboard Enter/Space must toggle. Save screenshot of final control in page context.

Verified: strictbuild passed,32 existinghomepage/architecturetests passed;
1440/768/390px fresh live runtime has no overflow. Local closed light values match
reference11.5px/500/18.975px/1.15px/#7a7e87, plus#0b57d0, hover#121317.
Enter opens with '– '; Space closes with '+ '. No data-edwinos-callout binding.
Both palettes/states have transparent fill,0px border/padding/radius and no arrow.
Dark uses existing #b3bbc4 label/#58a6ff prefix. Body text and links unchanged.
Screenshot:`/tmp/edwin-profile-disclosure-light.png` and
`/tmp/edwin-profile-disclosure-dark-mobile.png`.
