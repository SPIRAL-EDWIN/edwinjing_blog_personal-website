/* Reserved for lightweight UI hooks. */
(function () {
  "use strict";

  function updateHomepageClass() {
    var pathname = (window.location.pathname || "").replace(/\/+$/, "");
    var isByPath = pathname === "" || pathname === "/" || pathname.endsWith("/index.html");

    var logo = document.querySelector(".md-header__button.md-logo");
    var logoHref = logo ? (logo.getAttribute("href") || "").trim() : "";
    var isByLogo = logoHref === "." || logoHref === "./";

    var isHomepage = isByPath || isByLogo;
    document.body.classList.toggle("is-homepage", isHomepage);
  }

  /**
   * Fix ordered-list numbering across admonition / blockquote breaks.
   *
   * When Obsidian-style notes have:
   *
   *   1. step one
   *   2. step two
   *   3. step three
   *   > [!warning] note about step 3
   *   4. step four
   *   5. step five
   *
   * Markdown parses this as two separate <ol> blocks (the un-indented warning
   * block ends the list). The second <ol> renumbers from 1. This routine
   * walks the content, finds <ol> blocks that are direct siblings via only
   * .admonition / blockquote / details bridges, and sets start="N" on each
   * follow-up <ol> so numbering continues seamlessly.
   *
   * Bridge tags: any element with class .admonition, plain <blockquote>, or
   *              <details> (collapsible callouts).
   */
  function fixOrderedListContinuity() {
    var content = document.querySelector(".md-content__inner") || document.body;
    if (!content) return;

    var BRIDGE_SELECTORS = [
      ".admonition",   // pymdownx admonition / mkdocs-callouts output
      "blockquote",    // raw blockquote (Obsidian callouts before plugin)
      "details"        // collapsible admonitions
    ];

    function isBridge(el) {
      if (!el || el.nodeType !== 1) return false;
      var tag = el.tagName.toLowerCase();
      if (tag === "blockquote" || tag === "details") return true;
      if (el.classList && el.classList.contains("admonition")) return true;
      return false;
    }

    function previousNonEmpty(el) {
      var p = el.previousElementSibling;
      // Skip empty text-only wrappers if any (none expected, but defensive).
      return p;
    }

    // Walk all <ol> elements; if the immediately-previous element (skipping
    // bridges) is itself an <ol>, set start = prevStart + prevItemCount.
    var allOls = content.querySelectorAll("ol");
    allOls.forEach(function (ol) {
      // Skip non-content lists (search dropdown, nav menus, TOC).
      if (
        ol.closest(".md-search") ||
        ol.closest(".md-nav") ||
        ol.closest(".md-header") ||
        ol.closest(".md-footer")
      ) return;

      var prev = previousNonEmpty(ol);
      // Walk back across bridges to find the most recent <ol>
      var bridgeChain = [];
      while (prev && isBridge(prev)) {
        bridgeChain.push(prev);
        prev = previousNonEmpty(prev);
      }

      if (!prev || prev.tagName.toLowerCase() !== "ol") return;
      if (bridgeChain.length === 0) return;  // No bridge → nothing to fix

      // Count top-level <li> in prev <ol> and respect its start= if any.
      var prevStart = parseInt(prev.getAttribute("start") || "1", 10);
      var prevItems = Array.prototype.filter.call(prev.children, function (c) {
        return c.tagName && c.tagName.toLowerCase() === "li";
      }).length;

      var newStart = prevStart + prevItems;
      ol.setAttribute("start", String(newStart));
      ol.setAttribute("data-continued-from", String(prevStart));
    });
  }

  function runAll() {
    updateHomepageClass();
    fixOrderedListContinuity();
  }

  document.addEventListener("DOMContentLoaded", runAll);

  // MkDocs Material instant navigation support.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(runAll);
  }
})();
