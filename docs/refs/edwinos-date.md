---
archive: false
search:
  exclude: true
---

# EdwinOS date reference

Checked 2026-10-31 against `https://edwinjing.github.io/`. The academic homepage has no separate post listing: its “Archive of Updates” links to the blog Archive. The homepage's **Recent News** rows are the reference for its visible date style. The blog Archive's cards instead use a separate `archive-card__meta` design and an English month-day-year date.

Playwright's direct request to the external origin timed out. To inspect the actual current page rather than guess, the comparison loaded the live HTML and three live CSS responses retrieved with `curl` into Playwright at the original URL through request interception. Other requests were blocked; fonts were supplied from the user's local academic-site project. This establishes the measured style of the fetched snapshot, not a complete direct-network browser test. Dark mode was simulated by setting Material's `data-md-color-scheme="slate"`. Reference captures: `output/playwright/date-reference-1440-light.png`, `date-reference-1440-dark.png`, `date-reference-375-light.png`, `date-reference-375-dark.png`.

| Property | Recent News reference |
| --- | --- |
| Text | `MM/YYYY`, e.g. `11/2026`; slash separator |
| Typeface | `--edwinos-font-reading-sans` (`Outfit EdwinOS`, Noto Sans SC and system fallbacks) |
| Size / weight / line height | 12px / 500 / 19.8px (1.65) |
| Color | `--academic-date`: light `#14796d`; dark `#3fb950` |
| Spacing / case / numerals | `0.02em` (0.24px), uppercase, normal numeric variant |
| Alignment | start-aligned, first baseline with text; no date-specific hover effect |
| Desktop columns | 72px date column; 14px gap |
| Mobile reference | 56px date column; 10px gap at 375px |

The blog Recent Updates rows reuse `news-date` and the existing final Recent News typography rule, with its existing stacked mobile layout. The visible label matches the reference; the complete original day remains in `datetime` and the date's accessible name. The article title continues to receive the existing hover accent; the date color does not change. Local captures: `output/playwright/date-local-1440-light.png`, `date-local-1440-dark.png`, `date-local-375-light.png`, `date-local-375-dark.png`. Computed typography and colors match the reference in both schemes; the mobile layout intentionally stacks rather than reproducing the reference's 56px column.
