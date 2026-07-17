/**
 * Obsidian / MkDocs fragment links
 *
 * When a URL contains a hash (for example #d098de or a heading slug), highlight
 * the actual target sentence, paragraph, list item, table row, code block, or
 * heading instead of leaving readers on a visually ambiguous full page.
 */
(function () {
  "use strict";

  var HIGHLIGHT_CLASS = "block-highlight";
  var HIGHLIGHT_ACTIVE_CLASS = "block-highlight--active";
  var CONTENT_SELECTOR = ".md-content__inner";
  var documentSequence = 0;
  var delayedHighlightTimers = [];
  var removalTimers = [];
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
      el.classList.remove(HIGHLIGHT_CLASS, HIGHLIGHT_ACTIVE_CLASS);
    });
  }

  function cancelTimers(timers) {
    timers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    timers.length = 0;
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

    // Restart the animation even when the same hash is clicked twice.
    highlightTarget.classList.remove(HIGHLIGHT_CLASS, HIGHLIGHT_ACTIVE_CLASS);
    void highlightTarget.offsetWidth;
    highlightTarget.classList.add(HIGHLIGHT_CLASS, HIGHLIGHT_ACTIVE_CLASS);

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

  function handleHashLinkClick(event) {
    var link = event.target.closest ? event.target.closest("a[href*='#']") : null;
    if (!link || !isSamePageHashLink(link)) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (link.target && link.target !== "_self") return;

    var url = new URL(link.getAttribute("href"), window.location.href);
    if (!findTarget(url.hash)) return;

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

  function upgradeLegacyBlockAnchors() {
    var root = contentRoot();
    if (!root || root.dataset.blockAnchorsUpgraded === "true") return;

    // The build hook now creates these anchors. This fallback only covers older
    // already-rendered pages or manually written HTML that still exposes ^ids.
    var html = root.innerHTML;
    var next = html
      .replace(/(\S)\s*\^([a-zA-Z0-9_-]{4,})(\s*<br\s*\/?>|\s*<\/p>|\s*$)/gi, function (match, before, blockId, after) {
        return document.getElementById(blockId)
          ? match
          : before + "<span id=\"" + blockId + "\" class=\"block-anchor\"></span>" + after;
      })
      .replace(/(<\/(?:strong|em|code|b|i|span|mark|u)>)\s*\^([a-zA-Z0-9_-]{4,})/gi, function (match, closingTag, blockId) {
        return document.getElementById(blockId)
          ? match
          : closingTag + "<span id=\"" + blockId + "\" class=\"block-anchor\"></span>";
      })
      .replace(/<p>\s*\^([a-zA-Z0-9_-]{4,})\s*<\/p>/gi, function (match, blockId) {
        return document.getElementById(blockId)
          ? match
          : "<p><span id=\"" + blockId + "\" class=\"block-anchor\"></span></p>";
      });

    if (next !== html) {
      root.innerHTML = next;
    }
    root.dataset.blockAnchorsUpgraded = "true";
  }

  function run() {
    documentSequence += 1;
    cancelTimers(delayedHighlightTimers);
    cancelTimers(removalTimers);
    clearHighlights();
    upgradeLegacyBlockAnchors();
    highlightCurrentHash();
  }

  document.addEventListener("click", handleHashLinkClick, true);
  window.addEventListener("hashchange", function () {
    highlight(window.location.hash);
  });

  // MkDocs Material instant navigation support.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(run);
  } else {
    document.addEventListener("DOMContentLoaded", run);
  }
})();
