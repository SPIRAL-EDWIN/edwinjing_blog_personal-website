/**
 * Obsidian / MkDocs fragment links
 *
 * Owns fragment/hash navigation after build-time block-anchor generation.
 * When a URL contains a hash (for example #d098de or a heading slug), highlight
 * the actual target sentence, paragraph, list item, table row, code block, or
 * heading instead of leaving readers on a visually ambiguous full page. It
 * also realigns the current target after layout-changing runtimes settle.
 */
(function () {
  "use strict";

  var HIGHLIGHT_CLASS = "block-highlight";
  var HIGHLIGHT_ACTIVE_CLASS = "block-highlight--active";
  var HIGHLIGHT_PINNED_CLASS = "block-highlight--pinned";
  var HIGHLIGHT_FADING_CLASS = "block-highlight--fading";
  var TOC_SELECTED_CLASS = "edwinos-toc-link--selected";
  var CONTENT_SELECTOR = ".md-content__inner";
  var HASH_LAYOUT_SETTLED_EVENT = "edwinos:hash-layout-settled";
  var HEADING_SCROLL_MIN_DURATION = 420;
  var HEADING_SCROLL_MAX_DURATION = 1500;
  var HEADING_SCROLL_DURATION_PER_ROOT_VIEWPORT = 180;
  var HEADING_SCROLL_RAMP = 0.22;
  // Material's TOC scrollspy commits its active hash after a short debounce.
  // Leave enough time for that pass, then restore the exact entry the reader
  // selected (important for headings near the document's lower scroll limit).
  var HEADING_SCROLL_SETTLE_DELAY = 650;
  var HEADING_HOLD_DURATION = 500;
  var documentSequence = 0;
  var delayedHighlightTimers = [];
  var removalTimers = [];
  var tocSyncTimers = [];
  var tocSyncSequence = 0;
  var headingScrollFrame = null;
  var tocSelectionGuardUntil = 0;
  var tocSelectionClearTimer = null;
  var HIGHLIGHTABLE_SELECTOR = [
    ".admonition-title",
    "p",
    "li",
    "tr",
    "dt",
    "dd",
    "blockquote",
    "pre",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6"
  ].join(", ");

  function contentRoot() {
    return document.querySelector(CONTENT_SELECTOR) || document.querySelector(".md-content") || document.body;
  }

  function escapeSelector(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return value.replace(/["\\#.;?+*~':!^$[\]()=>|/@]/g, "\\$&");
  }

  function decodeHash(hash) {
    if (!hash) return "";
    var raw = hash.charAt(0) === "#" ? hash.slice(1) : hash;
    try {
      return decodeURIComponent(raw);
    } catch (_error) {
      return raw;
    }
  }

  function findTarget(hash) {
    var id = decodeHash(hash);
    if (!id) return null;

    return (
      document.getElementById(id) ||
      document.querySelector("[name=\"" + escapeSelector(id) + "\"]")
    );
  }

  function meaningfulTarget(target) {
    if (!target) return null;

    var root = contentRoot();
    if (target === root) return target;

    if (target.matches && target.matches(HIGHLIGHTABLE_SELECTOR)) {
      return target;
    }

    var closest = target.closest ? target.closest(HIGHLIGHTABLE_SELECTOR) : null;
    if (closest && root.contains(closest)) {
      return closest;
    }

    // Heading block anchors are often rendered as:
    //   <h5 id="heading-slug">Title <span id="blockid"></span>...</h5>
    var heading = target.closest ? target.closest("h1, h2, h3, h4, h5, h6") : null;
    if (heading && root.contains(heading)) {
      return heading;
    }

    var parent = target.parentElement;
    while (parent && parent !== root && parent !== document.body) {
      if (parent.matches && parent.matches(HIGHLIGHTABLE_SELECTOR)) return parent;
      parent = parent.parentElement;
    }

    return target;
  }

  function clearHighlights() {
    document.querySelectorAll("." + HIGHLIGHT_CLASS).forEach(function (el) {
      el.classList.remove(
        HIGHLIGHT_CLASS,
        HIGHLIGHT_ACTIVE_CLASS,
        HIGHLIGHT_PINNED_CLASS,
        HIGHLIGHT_FADING_CLASS
      );
    });
  }

  function cancelTimers(timers) {
    timers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    timers.length = 0;
  }

  function cancelHeadingScroll() {
    if (headingScrollFrame === null) return;
    window.cancelAnimationFrame(headingScrollFrame);
    headingScrollFrame = null;
  }

  function cancelTocHeadingSync() {
    tocSyncSequence += 1;
    cancelTimers(tocSyncTimers);
  }

  function highlight(hash, options) {
    options = options || {};

    var target = findTarget(hash);
    if (!target) return false;

    var highlightTarget = meaningfulTarget(target);
    if (!highlightTarget) return false;

    cancelTimers(removalTimers);
    clearHighlights();

    if (options.scroll !== false) {
      highlightTarget.scrollIntoView({
        behavior: options.smooth === false ? "auto" : "smooth",
        block: "center"
      });
    }

    var isHeading = Boolean(
      highlightTarget.matches && highlightTarget.matches("h1, h2, h3, h4, h5, h6")
    );

    // Heading targets remain visibly selected until another fragment is
    // chosen. Sentence/block targets keep the existing short fade animation.
    highlightTarget.classList.remove(
      HIGHLIGHT_CLASS,
      HIGHLIGHT_ACTIVE_CLASS,
      HIGHLIGHT_PINNED_CLASS,
      HIGHLIGHT_FADING_CLASS
    );
    void highlightTarget.offsetWidth;
    highlightTarget.classList.add(
      HIGHLIGHT_CLASS,
      isHeading ? HIGHLIGHT_PINNED_CLASS : HIGHLIGHT_ACTIVE_CLASS
    );

    if (isHeading) {
      // Keep the target visible through the scroll and reading hand-off, then
      // fade only the highlight chrome; the heading text remains untouched.
      var headingFadeDelay = typeof options.headingFadeDelay === "number"
        ? options.headingFadeDelay
        : HEADING_HOLD_DURATION;
      removalTimers.push(window.setTimeout(function () {
        highlightTarget.classList.add(HIGHLIGHT_FADING_CLASS);
      }, headingFadeDelay));
      return true;
    }

    removalTimers.push(window.setTimeout(function () {
      highlightTarget.classList.remove(HIGHLIGHT_ACTIVE_CLASS);
    }, 5000));

    removalTimers.push(window.setTimeout(function () {
      highlightTarget.classList.remove(HIGHLIGHT_CLASS);
    }, 5200));

    return true;
  }

  function normalizePath(pathname) {
    return (pathname || window.location.pathname).replace(/\/index\.html$/, "/");
  }

  function isSamePageHashLink(link) {
    var href = link.getAttribute("href") || "";
    if (!href || href === "#") return false;

    var url;
    try {
      url = new URL(href, window.location.href);
    } catch (_error) {
      return false;
    }

    return (
      url.hash &&
      url.origin === window.location.origin &&
      normalizePath(url.pathname) === normalizePath(window.location.pathname)
    );
  }

  function alignHeadingTarget(hash, behavior) {
    var target = meaningfulTarget(findTarget(hash));
    if (!target || !target.matches("h1, h2, h3, h4, h5, h6")) return 0;

    var header = document.querySelector(".md-header");
    // Leave enough breathing room below EdwinOS's translucent header/notch so
    // the selected heading is not caught in its blur falloff.
    var offset = (header ? header.getBoundingClientRect().height : 0) + 40;
    var top = target.getBoundingClientRect().top + window.scrollY - offset;
    top = Math.max(0, top);

    cancelHeadingScroll();
    if (
      behavior !== "smooth"
      || (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    ) {
      window.scrollTo({ top: top, behavior: "instant" });
      return 0;
    }

    // Native smooth scrolling can collapse to a near-instant jump depending
    // on the browser and page distance. Scale duration sublinearly by the
    // number of viewports crossed so long jumps retain spatial context without
    // making nearby headings feel sluggish.
    var start = window.scrollY;
    var distance = top - start;
    var viewportHeight = Math.max(window.innerHeight || 0, 1);
    var rootViewports = Math.sqrt(Math.abs(distance) / viewportHeight);
    var duration = Math.min(
      HEADING_SCROLL_MAX_DURATION,
      Math.max(
        HEADING_SCROLL_MIN_DURATION,
        HEADING_SCROLL_MIN_DURATION
          + HEADING_SCROLL_DURATION_PER_ROOT_VIEWPORT * rootViewports
      )
    );
    if (Math.abs(distance) < 1) return 0;

    var startedAt = null;
    function step(timestamp) {
      if (startedAt === null) startedAt = timestamp;
      var progress = Math.min(1, (timestamp - startedAt) / duration);
      // Raised-cosine velocity ramps keep velocity and acceleration continuous
      // into and out of the steady middle section. Integrating that velocity
      // gives the position curve below.
      var ramp = HEADING_SCROLL_RAMP;
      var maxVelocity = 1 / (1 - ramp);
      var eased;
      if (progress < ramp) {
        eased = maxVelocity * (
          0.5 * progress
          - ramp * Math.sin(Math.PI * progress / ramp) / (2 * Math.PI)
        );
      } else if (progress <= 1 - ramp) {
        eased = maxVelocity * (progress - 0.5 * ramp);
      } else {
        var remaining = 1 - progress;
        eased = 1 - maxVelocity * (
          0.5 * remaining
          - ramp * Math.sin(Math.PI * remaining / ramp) / (2 * Math.PI)
        );
      }
      window.scrollTo({
        top: start + distance * eased,
        behavior: "instant"
      });
      if (progress < 1) {
        headingScrollFrame = window.requestAnimationFrame(step);
      } else {
        headingScrollFrame = null;
      }
    }
    headingScrollFrame = window.requestAnimationFrame(step);
    return duration;
  }

  function clearTocSelection() {
    document.querySelectorAll("." + TOC_SELECTED_CLASS).forEach(function (item) {
      item.classList.remove(TOC_SELECTED_CLASS);
    });
  }

  function replaceCurrentHash(hash) {
    var url = new URL(window.location.href);
    url.hash = hash;
    window.history.replaceState(
      null,
      "",
      url.pathname + url.search + url.hash
    );
  }

  function keepTocLinkVisible(link, hash) {
    link = Array.prototype.find.call(
      document.querySelectorAll(".md-sidebar--secondary a.md-nav__link[href*='#']"),
      function (item) {
        return item.hash === hash && item.getBoundingClientRect().width > 0;
      }
    ) || link;
    if (!link || !link.isConnected) return;
    var sidebar = link.closest(".md-sidebar--secondary");
    if (sidebar) {
      sidebar.querySelectorAll("." + TOC_SELECTED_CLASS).forEach(function (item) {
        if (item !== link) item.classList.remove(TOC_SELECTED_CLASS);
      });
      link.classList.add(TOC_SELECTED_CLASS);
    }

    var scrollwrap = link.closest(".md-sidebar__scrollwrap");
    if (!scrollwrap) return;

    var linkRect = link.getBoundingClientRect();
    var wrapRect = scrollwrap.getBoundingClientRect();
    var padding = 24;
    if (linkRect.top < wrapRect.top + padding) {
      scrollwrap.scrollTop += linkRect.top - wrapRect.top - padding;
    } else if (linkRect.bottom > wrapRect.bottom - padding) {
      scrollwrap.scrollTop += linkRect.bottom - wrapRect.bottom + padding;
    }
  }

  function scheduleTocHeadingSync(hash, link) {
    cancelTocHeadingSync();
    var syncSequence = tocSyncSequence;
    var expectedPage = normalizePath(window.location.pathname)
      + window.location.search;

    function isCurrentTocNavigation(allowIntermediateHash) {
      return syncSequence === tocSyncSequence
        && expectedPage === normalizePath(window.location.pathname)
          + window.location.search
        && (allowIntermediateHash || window.location.hash === hash);
    }

    function repairTocState(allowIntermediateHash) {
      if (!isCurrentTocNavigation(allowIntermediateHash)) return;
      var heading = meaningfulTarget(findTarget(hash));
      if (!heading || !heading.classList.contains(HIGHLIGHT_PINNED_CLASS)) {
        highlight(hash, { scroll: false });
      }
      window.requestAnimationFrame(function () {
        if (!isCurrentTocNavigation(allowIntermediateHash)) return;
        replaceCurrentHash(hash);
        keepTocLinkVisible(link, hash);
      });
    }

    var duration = alignHeadingTarget(hash, "smooth");
    tocSelectionGuardUntil = Date.now() + duration + HEADING_SCROLL_SETTLE_DELAY;
    highlight(hash, {
      scroll: false,
      headingFadeDelay: duration + HEADING_HOLD_DURATION
    });
    repairTocState(false);

    // Repair once after the distance-aware animation/layout settling period.
    // Material's scrollspy may expose an intermediate heading hash while the
    // page moves. Only the still-current navigation token may restore the
    // requested hash; clicks, history navigation, page swaps, and user input
    // all invalidate that token before this delayed task can run.
    tocSyncTimers.push(window.setTimeout(
      function () { repairTocState(true); },
      duration + HEADING_SCROLL_SETTLE_DELAY
    ));
  }

  function handleHashLinkClick(event) {
    var link = event.target.closest ? event.target.closest("a[href*='#']") : null;
    if (!link || !isSamePageHashLink(link)) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;

    var url = new URL(link.getAttribute("href"), window.location.href);
    if (!findTarget(url.hash)) return;
    cancelTocHeadingSync();

    // Own TOC navigation so Material/native fragment scrolling cannot race the
    // deliberate EdwinOS animation or snap it to the final position early.
    if (link.closest(".md-nav--secondary, [data-md-component='toc']")) {
      event.preventDefault();
      event.stopPropagation();
      history.pushState(null, "", url.pathname + url.search + url.hash);
      scheduleTocHeadingSync(url.hash, link);
      return;
    }

    // Material handles links on body before a document bubble listener. Capture
    // the same-page case first so its pushState doesn't swallow our highlight.
    event.preventDefault();
    event.stopPropagation();
    history.pushState(null, "", url.pathname + url.search + url.hash);
    highlight(url.hash);
  }

  function highlightCurrentHash() {
    if (!window.location.hash) return;
    var sequence = documentSequence;
    var expectedLocation = window.location.pathname + window.location.search + window.location.hash;

    // Run twice: once quickly, once after Material/MathJax/layout plugins settle.
    delayedHighlightTimers.push(window.setTimeout(function () {
      if (sequence !== documentSequence || expectedLocation !== window.location.pathname + window.location.search + window.location.hash) return;
      highlight(window.location.hash, { scroll: false });
    }, 80));

    delayedHighlightTimers.push(window.setTimeout(function () {
      if (sequence !== documentSequence || expectedLocation !== window.location.pathname + window.location.search + window.location.hash) return;
      highlight(window.location.hash, { scroll: false });
    }, 520));
  }

  /**
   * Re-align the exact fragment target after a runtime reports layout settling.
   *
   * MathJax used to duplicate this hash-scroll implementation. Keeping the
   * double animation-frame delay, header offset, and instant behavior here
   * preserves that hand-off while making fragment positioning single-owner.
   */
  function realignHashAfterLayout(event) {
    var hash = event && event.detail && event.detail.hash;
    if (!hash || hash !== window.location.hash) return;

    var target = findTarget(hash);
    if (!target) return;

    var sequence = documentSequence;
    var expectedLocation = window.location.pathname + window.location.search + hash;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (
          sequence !== documentSequence ||
          expectedLocation !== window.location.pathname + window.location.search + window.location.hash
        ) return;

        var header = document.querySelector(".md-header");
        var offset = (header ? header.getBoundingClientRect().height : 0) + 40;
        var top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
      });
    });
  }

  function run() {
    documentSequence += 1;
    cancelTimers(delayedHighlightTimers);
    cancelTimers(removalTimers);
    cancelTocHeadingSync();
    cancelHeadingScroll();
    tocSelectionGuardUntil = 0;
    window.clearTimeout(tocSelectionClearTimer);
    clearHighlights();
    clearTocSelection();
    highlightCurrentHash();
  }

  document.addEventListener("click", handleHashLinkClick, true);
  document.addEventListener(HASH_LAYOUT_SETTLED_EVENT, realignHashAfterLayout);
  window.addEventListener("hashchange", function () {
    // Material's scrollspy can expose an intermediate heading hash while our
    // distance-aware TOC animation is still in flight. Keep the animation
    // token alive; its settle pass restores the link the reader selected.
    if (Date.now() < tocSelectionGuardUntil) return;
    cancelHeadingScroll();
    cancelTocHeadingSync();
    tocSelectionGuardUntil = 0;
    // Native fragment navigation already owns scrolling. Re-centering here
    // races Material's TOC scrollspy and can leave the previous item active.
    highlight(window.location.hash, { scroll: false });
  });
  window.addEventListener("popstate", function () {
    // History navigation is an explicit reader action, so it must always win
    // over an in-flight TOC animation even during the short guard window.
    cancelHeadingScroll();
    cancelTocHeadingSync();
    tocSelectionGuardUntil = 0;
  });
  window.addEventListener("scroll", function () {
    if (Date.now() < tocSelectionGuardUntil) return;
    window.clearTimeout(tocSelectionClearTimer);
    tocSelectionClearTimer = window.setTimeout(clearTocSelection, 80);
  }, { passive: true });
  window.addEventListener("scrollend", function () {
    if (Date.now() < tocSelectionGuardUntil) return;
    clearTocSelection();
  }, { passive: true });
  function yieldTocMotionToUser(event) {
    if (
      event.type === "keydown"
      && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)
    ) return;
    cancelHeadingScroll();
    cancelTocHeadingSync();
    tocSelectionGuardUntil = 0;
    clearTocSelection();
  }
  window.addEventListener("wheel", yieldTocMotionToUser, { passive: true });
  window.addEventListener("touchstart", yieldTocMotionToUser, { passive: true });
  window.addEventListener("pointerdown", yieldTocMotionToUser, { passive: true });
  document.addEventListener("keydown", yieldTocMotionToUser);

  // MkDocs Material instant navigation support.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(run);
  } else {
    document.addEventListener("DOMContentLoaded", run);
  }
})();
