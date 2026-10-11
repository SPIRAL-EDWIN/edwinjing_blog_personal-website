/**
 * EdwinOS runtime UI adaptations.
 *
 * Owns idempotent DOM enhancements that must be reapplied after MkDocs
 * Material instant navigation (route classes, header/search/profile shells,
 * source facts, visitor metadata, callouts, and list continuity). Content
 * conversion and fragment/hash navigation are intentionally owned elsewhere.
 */
(function () {
  "use strict";

  var PRIMARY_SIDEBAR_DESKTOP_QUERY = "(min-width: 76.25em)";
  var SEARCH_QUERY_STORAGE_KEY = "edwinos.search-memory.v2";
  var searchQueryMemory = createSearchQueryMemory();
  var primarySidebarScrollPositions = Object.create(null);
  var pendingPrimarySidebarScroll = null;
  var lastDocumentPageKey = navigationPageKey(window.location.href);
  var headerSearchRuntime = null;
  var topGlassRuntime = null;
  var searchResultSummarySubscription = null;
  var searchSnippetSources = new WeakMap();
  var sectionNavigationDepthTimer = null;
  var archiveNavigationFeedbackReady = false;
  var archiveNavigationFallbackTimer = null;
  var navigationFeedbackDelayTimer = null;
  var navigationGlassRuntime = null;
  // One pending navigation owns both Archive cards and ordinary page links.
  var activeArchiveNavigation = null;
  var mountedNavigationContent = null;
  var mountedNavigationHref = window.location.href;
  var navigationLabels = Object.create(null);
  var progressiveImages = new WeakSet();
  var pdfViewers = new WeakMap();
  var activePdfViewers = [];
  var friendCountRequest = null;
  var friendCountValue = null;
  var enhancedContent = null;
  var enhancedHeader = null;
  var searchHighlightScopeRoot = null;
  var searchHighlightScopeObserver = null;
  var articleSearchHighlightMotion = null;
  var firstScreenReady = false;
  var deferredWork = [];

  function afterFirstScreen(callback) {
    if (firstScreenReady) callback();
    else deferredWork.push(callback);
  }

  function releaseDeferredWork() {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        window.setTimeout(function () {
          var release = function () {
            firstScreenReady = true;
            deferredWork.splice(0).forEach(function (callback) { callback(); });
          };
          if (window.requestIdleCallback) window.requestIdleCallback(release, { timeout: 2000 });
          else release();
        }, 1000);
      });
    });
  }
  if (document.readyState === "complete") releaseDeferredWork();
  else window.addEventListener("load", releaseDeferredWork, { once: true });

  function navigationPageKey(value) {
    try {
      var url = new URL(value, window.location.href);
      var pathname = url.pathname.replace(/\/index\.html$/i, "/");
      return pathname + url.search;
    } catch (error) {
      return "";
    }
  }

  function primarySidebarIsDesktop() {
    return typeof window.matchMedia === "function" &&
      window.matchMedia(PRIMARY_SIDEBAR_DESKTOP_QUERY).matches;
  }

  function primarySidebarScroller() {
    return document.querySelector(".md-sidebar--primary .md-sidebar__scrollwrap");
  }

  function rememberPrimarySidebarScroll(event) {
    if (!primarySidebarIsDesktop() || event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    var target = event.target && event.target.closest
      ? event.target
      : event.target && event.target.parentElement;
    var link = target && target.closest ? target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download")) return;
    if (link.target && link.target !== "_self") return;

    var destination;
    try {
      destination = new URL(link.getAttribute("href"), window.location.href);
    } catch (error) {
      return;
    }

    if (!/^https?:$/.test(destination.protocol) || destination.origin !== window.location.origin) return;

    var destinationKey = navigationPageKey(destination.href);
    var currentKey = navigationPageKey(window.location.href);
    if (!destinationKey || destinationKey === currentKey) return;

    var scroller = primarySidebarScroller();
    if (!scroller) return;

    var scrollTop = scroller.scrollTop;
    primarySidebarScrollPositions[currentKey] = scrollTop;
    pendingPrimarySidebarScroll = {
      pageKey: destinationKey,
      scrollTop: scrollTop
    };
  }

  function rememberPrimarySidebarScrollForHistory() {
    var destinationKey = navigationPageKey(window.location.href);
    if (!primarySidebarIsDesktop()) {
      pendingPrimarySidebarScroll = null;
      lastDocumentPageKey = destinationKey;
      return;
    }

    var scroller = primarySidebarScroller();
    if (!scroller) return;

    primarySidebarScrollPositions[lastDocumentPageKey] = scroller.scrollTop;
    pendingPrimarySidebarScroll = {
      pageKey: destinationKey,
      scrollTop: Object.prototype.hasOwnProperty.call(primarySidebarScrollPositions, destinationKey)
        ? primarySidebarScrollPositions[destinationKey]
        : scroller.scrollTop
    };
  }

  function restorePrimarySidebarScroll() {
    var currentKey = navigationPageKey(window.location.href);
    lastDocumentPageKey = currentKey;

    if (!primarySidebarIsDesktop()) {
      pendingPrimarySidebarScroll = null;
      return;
    }

    var scroller = primarySidebarScroller();
    if (!scroller || !pendingPrimarySidebarScroll) return;

    // Assignment is synchronous and intentionally bypasses smooth scrolling so
    // the replacement sidebar is corrected in the document$ turn before paint.
    scroller.scrollTop = pendingPrimarySidebarScroll.scrollTop;
    primarySidebarScrollPositions[currentKey] = scroller.scrollTop;

    if (pendingPrimarySidebarScroll.pageKey === currentKey) {
      pendingPrimarySidebarScroll = null;
    }
  }

  function setupPrimarySidebarScrollPreservation() {
    document.addEventListener("click", rememberPrimarySidebarScroll, true);
    window.addEventListener("popstate", rememberPrimarySidebarScrollForHistory);
  }

  function navigationDocumentKey(value) {
    try {
      return new URL(value, window.location.href).pathname.replace(/\/index\.html$/i, "/");
    } catch (error) { return ""; }
  }

  function archiveDestination(link) {
    if (!link || link.hasAttribute("download")) return null;
    if (link.target && link.target !== "_self") return null;
    if (link.closest(".md-search__result, [data-pdf-viewer]")) return null;
    try {
      var destination = new URL(link.getAttribute("href"), window.location.href);
      if (!/^https?:$/.test(destination.protocol) || destination.origin !== window.location.origin) return null;
      // Native assets and same-document fragments retain their own owners.
      if (/\.(?:pdf|jpe?g|png|webp|gif|svg|avif|mp4|webm|zip|gz|txt|csv)$/i.test(destination.pathname)) return null;
      if (navigationDocumentKey(destination.href) === navigationDocumentKey(window.location.href)) return null;
      return destination;
    } catch (error) {
      return null;
    }
  }

  function clearArchiveNavigationFeedback() {
    if (navigationFeedbackDelayTimer !== null) {
      window.clearTimeout(navigationFeedbackDelayTimer);
      navigationFeedbackDelayTimer = null;
    }
    if (navigationGlassRuntime) navigationGlassRuntime.destroy();
    navigationGlassRuntime = null;
    if (archiveNavigationFallbackTimer !== null) {
      window.clearTimeout(archiveNavigationFallbackTimer);
      archiveNavigationFallbackTimer = null;
    }
    activeArchiveNavigation = null;
    if (!document.body) return;
    document.body.classList.remove("is-archive-navigating", "is-page-navigating");
    document.body.style.removeProperty("--edwinos-navigation-top");
    ["archive-navigation-help", "page-navigation-feedback"].forEach(function (id) {
      var element = document.getElementById(id);
      if (element) element.remove();
    });
    document.querySelectorAll("a.is-opening[aria-busy]").forEach(function (link) {
      link.classList.remove("is-opening");
      link.removeAttribute("aria-busy");
    });
  }

  function finishArchiveNavigationFeedback() {
    // Material changes the address before the HTML arrives. Only a replaced
    // content node proves that the next document is actually on screen.
    if (activeArchiveNavigation &&
        document.querySelector(".md-content__inner") === activeArchiveNavigation.content) return;
    clearArchiveNavigationFeedback();
    var content = document.querySelector(".md-content__inner");
    if (content && content !== mountedNavigationContent) {
      mountedNavigationContent = content;
      mountedNavigationHref = window.location.href;
      var title = content.querySelector("h1");
      navigationLabels[navigationPageKey(mountedNavigationHref)] = title ? title.textContent.trim() : document.title;
    }
  }

  function cancelArchiveNavigation() {
    var pending = activeArchiveNavigation;
    if (!pending) return;
    clearArchiveNavigationFeedback();
    // Rapid clicks may have pushed several URLs while the mounted article never
    // changed. Native replacement restores that actual source and atomically
    // disposes every pending request; history.back() can land on a stale target.
    window.location.replace(pending.sourceHref);
  }

  function navigationRecoveryControls(pending, parent) {
    var retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "直接打开";
    retry.addEventListener("click", function () {
      if (activeArchiveNavigation === pending) window.location.assign(pending.destination.href);
    });
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "取消并返回原文";
    cancel.addEventListener("click", cancelArchiveNavigation);
    parent.appendChild(retry);
    parent.appendChild(cancel);
  }

  function showArchiveNavigationHelp() {
    if (!activeArchiveNavigation || !document.body) return;
    archiveNavigationFallbackTimer = null;
    var pending = activeArchiveNavigation;
    if (!pending.archive) {
      var recovery = document.querySelector(".page-navigation-feedback__recovery");
      if (recovery) recovery.hidden = false;
      return;
    }
    var help = document.createElement("div");
    help.id = "archive-navigation-help";
    help.className = "archive-navigation-help";
    help.setAttribute("role", "status");
    help.setAttribute("aria-live", "polite");
    var message = document.createElement("p");
    message.textContent = "仍在打开笔记。可以直接打开，或取消并重新载入原文。";
    help.appendChild(message);
    navigationRecoveryControls(pending, help);
    document.body.appendChild(help);
  }

  function updateNavigationFeedbackGeometry(force) {
    if (!activeArchiveNavigation || !document.body) return;
    if (force !== true && !activeArchiveNavigation.archive && !document.getElementById("page-navigation-feedback")) return;
    var header = document.querySelector(".md-header");
    if (header) document.body.style.setProperty("--edwinos-navigation-top", Math.max(0, header.getBoundingClientRect().bottom) + "px");
  }

  function setupLayoutControlGlass(feedback, options) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var filterId = options.filterId;
    var prefix = options.prefix;
    var datasetMode = options.datasetMode;
    var datasetBuilds = options.datasetBuilds;
    var padding = 16;
    var disposed = false;
    var frame = 0;
    var mapKey = '';
    var builds = 0;
    var definitions = null;
    var resizeObserver = null;
    var chromium = /\b(?:Chrome|Chromium|Edg|EdgA|OPR)\//.test(window.navigator.userAgent);
    var refraction = chromium && window.CSS && typeof window.CSS.supports === 'function' &&
      window.CSS.supports('backdrop-filter', 'url(#' + filterId + ')') &&
      typeof window.SVGFEImageElement !== 'undefined' && typeof window.SVGFEDisplacementMapElement !== 'undefined';
    var canvas = refraction ? document.createElement('canvas') : null;
    var context = canvas ? canvas.getContext('2d') : null;
    refraction = Boolean(context);
    var highlight = document.createElement('span');
    highlight.className = prefix + '-glass__highlight';
    highlight.setAttribute('aria-hidden', 'true');
    feedback.appendChild(highlight);
    feedback.classList.add(prefix + '-glass');
    feedback.classList.toggle(prefix + '-refraction', refraction);
    feedback.dataset[datasetMode] = refraction ? 'refraction' : 'native-blur';
    if (refraction && options.filterVariable) feedback.style.setProperty(options.filterVariable, 'url(#' + filterId + ')');
    var filter;
    var mapImage;
    if (refraction) {
      definitions = document.createElementNS(svgNS, 'svg');
      definitions.setAttribute('width', '0');
      definitions.setAttribute('height', '0');
      definitions.setAttribute('aria-hidden', 'true');
      definitions.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;overflow:hidden';
      var defs = document.createElementNS(svgNS, 'defs');
      filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', filterId);
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      filter.setAttribute('x', String(-padding));
      filter.setAttribute('y', String(-padding));
      mapImage = document.createElementNS(svgNS, 'feImage');
      mapImage.setAttribute('result', prefix + '-map');
      mapImage.setAttribute('preserveAspectRatio', 'none');
      mapImage.setAttribute('x', String(-padding));
      mapImage.setAttribute('y', String(-padding));
      var blur = document.createElementNS(svgNS, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', '4');
      blur.setAttribute('result', prefix + '-blur');
      var displacement = document.createElementNS(svgNS, 'feDisplacementMap');
      displacement.setAttribute('in', prefix + '-blur');
      displacement.setAttribute('in2', prefix + '-map');
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      displacement.setAttribute('scale', '22');
      filter.appendChild(mapImage);
      filter.appendChild(blur);
      filter.appendChild(displacement);
      defs.appendChild(filter);
      definitions.appendChild(defs);
      document.body.appendChild(definitions);
    }
    function update() {
      frame = 0;
      if (disposed || !feedback.isConnected || !refraction) return;
      var box = feedback.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return;
      var radius = Math.min(box.width / 2, box.height / 2,
        parseFloat(window.getComputedStyle(feedback).borderTopLeftRadius) || 24);
      var key = Math.round(box.width) + ':' + Math.round(box.height) + ':' + Math.round(radius);
      if (key === mapKey) return;
      var sampleWidth = box.width + padding * 2;
      var sampleHeight = box.height + padding * 2;
      canvas.width = Math.min(768, Math.max(24, Math.ceil(sampleWidth * 1.5)));
      canvas.height = Math.min(512, Math.max(24, Math.ceil(sampleHeight * 1.5)));
      var pixels = context.createImageData(canvas.width, canvas.height);
      fillRoundedGlassDisplacementMap(pixels, box.width, box.height, padding, radius);
      context.putImageData(pixels, 0, 0);
      var url = canvas.toDataURL('image/png');
      filter.setAttribute('width', sampleWidth);
      filter.setAttribute('height', sampleHeight);
      mapImage.setAttribute('width', sampleWidth);
      mapImage.setAttribute('height', sampleHeight);
      mapImage.setAttribute('href', url);
      mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      feedback.style.setProperty('--' + prefix + '-radius', radius + 'px');
      mapKey = key;
      builds += 1;
      feedback.dataset[datasetBuilds] = String(builds);
    }
    function schedule() {
      if (!disposed && refraction && !frame) frame = window.requestAnimationFrame(update);
    }
    if (refraction) {
      window.addEventListener('resize', schedule, { passive: true });
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(schedule);
        resizeObserver.observe(feedback);
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
      schedule();
    }
    return {
      destroy: function () {
        disposed = true;
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        if (resizeObserver) resizeObserver.disconnect();
        if (definitions) definitions.remove();
        highlight.remove();
        feedback.classList.remove(prefix + '-glass', prefix + '-refraction');
        delete feedback.dataset[datasetMode];
        delete feedback.dataset[datasetBuilds];
        feedback.style.removeProperty('--' + prefix + '-radius');
        if (options.filterVariable) feedback.style.removeProperty(options.filterVariable);
      }
    };
  }

  function setupNavigationFeedbackGlass(feedback) {
    return setupLayoutControlGlass(feedback, {
      prefix: 'edwinos-navigation',
      filterId: 'edwinos-navigation-refraction',
      datasetMode: 'edwinosNavigationMode',
      datasetBuilds: 'edwinosNavigationMapBuilds'
    });
  }

  function setupPdfButtonGlass(button) {
    var glass = null;
    var observer = null;
    var visibilityObserver = null;
    var disposed = false;
    function dispose() {
      disposed = true;
      if (observer) observer.disconnect();
      if (visibilityObserver) visibilityObserver.disconnect();
      if (glass) glass.destroy();
      observer = null;
      visibilityObserver = null;
      glass = null;
    }
    function initialize() {
      if (disposed || glass || !button.isConnected || button.hidden) return;
      // PDF controls live below the article introduction and previews. Do not
      // build their map during unrelated first-screen or navigation work.
      setupPdfButtonGlass.sequence = (setupPdfButtonGlass.sequence || 0) + 1;
      glass = setupLayoutControlGlass(button, {
        prefix: 'edwinos-pdf',
        filterId: 'edwinos-pdf-refraction-' + setupPdfButtonGlass.sequence,
        filterVariable: '--edwinos-pdf-filter',
        datasetMode: 'edwinosPdfMode',
        datasetBuilds: 'edwinosPdfMapBuilds'
      });
      if (observer) observer.disconnect();
      observer = null;
    }
    if (typeof window.MutationObserver === 'function') {
      visibilityObserver = new window.MutationObserver(function () {
        if (button.hidden || !button.isConnected) dispose();
      });
      visibilityObserver.observe(button, { attributes: true, attributeFilter: ['hidden'] });
    }
    if (typeof window.IntersectionObserver === 'function') {
      observer = new window.IntersectionObserver(function (entries) {
        if (entries.some(function (entry) { return entry.isIntersecting; })) initialize();
      });
      observer.observe(button);
    } else {
      var box = button.getBoundingClientRect();
      if (box.bottom > 0 && box.top < window.innerHeight) initialize();
      // Older browsers keep the native CSS glass outside the first viewport.
    }
    return { destroy: dispose };
  }

  function showPageNavigationFeedback(pending, label) {
    if (activeArchiveNavigation !== pending || !document.body) return;
    updateNavigationFeedbackGeometry(true);
    document.body.classList.add("is-page-navigating");
    var feedback = document.createElement("div");
    feedback.id = "page-navigation-feedback";
    feedback.className = "page-navigation-feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    var message = document.createElement("p");
    message.className = "page-navigation-feedback__message";
    message.textContent = "正在打开「" + label + "」…";
    var recovery = document.createElement("div");
    recovery.className = "page-navigation-feedback__recovery";
    recovery.hidden = true;
    navigationRecoveryControls(pending, recovery);
    feedback.appendChild(message);
    feedback.appendChild(recovery);
    document.body.appendChild(feedback);
    navigationGlassRuntime = setupNavigationFeedbackGlass(feedback);
  }

  function startPageNavigationFeedback(destination, link) {
    var content = document.querySelector(".md-content__inner");
    if (!content || !document.body) return;
    // Fragment/query edits belong to this still-mounted article. Preserve its
    // latest address before the first cross-document click, never a pending URL.
    if (!activeArchiveNavigation &&
        navigationDocumentKey(window.location.href) === navigationDocumentKey(mountedNavigationHref)) {
      mountedNavigationHref = window.location.href;
    }
    var archive = Boolean(link && link.matches(".archive-card__link"));
    var label = link ? link.textContent.trim().replace(/\s+/g, " ") : navigationLabels[navigationPageKey(destination.href)];
    if (!label) {
      try { label = decodeURIComponent(destination.pathname.replace(/\/$/, "").split("/").pop()) || "页面"; }
      catch (error) { label = "页面"; }
    }
    clearArchiveNavigationFeedback();
    activeArchiveNavigation = {
      destination: destination,
      sourceHref: mountedNavigationHref,
      sourceKey: navigationPageKey(mountedNavigationHref),
      content: content,
      archive: archive
    };
    var pending = activeArchiveNavigation;
    if (link) {
      link.classList.add("is-opening");
      link.setAttribute("aria-busy", "true");
    }
    // Fast ordinary navigation does no layout measurement or body styling.
    // Material owns fetching; feedback is measured only after its 2s delay.
    if (archive) {
      document.body.classList.add("is-archive-navigating");
      updateNavigationFeedbackGeometry();
    }
    if (!archive) {
      navigationFeedbackDelayTimer = window.setTimeout(function () {
        navigationFeedbackDelayTimer = null;
        if (activeArchiveNavigation !== pending) return;
        if (document.querySelector(".md-content__inner") !== pending.content) {
          finishArchiveNavigationFeedback();
          return;
        }
        showPageNavigationFeedback(pending, label);
      }, 2000);
    }
    // A slow request is not a completed request: recovery becomes available,
    // while the waiting state remains until actual content replacement.
    archiveNavigationFallbackTimer = window.setTimeout(showArchiveNavigationHelp, 10000);
  }

  function beginArchiveNavigationFeedback(event) {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = event.target && event.target.closest ? event.target : event.target && event.target.parentElement;
    var link = target && target.closest ? target.closest("a[href]") : null;
    if (!link || !link.closest(".md-sidebar--primary, .md-tabs, .md-content__inner")) return;
    var destination = archiveDestination(link);
    if (destination) startPageNavigationFeedback(destination, link);
  }

  function pageNavigationForHistory() {
    if (navigationDocumentKey(window.location.href) === navigationDocumentKey(mountedNavigationHref)) {
      mountedNavigationHref = window.location.href;
      clearArchiveNavigationFeedback();
      return;
    }
    startPageNavigationFeedback(new URL(window.location.href), null);
  }

  function setupArchiveNavigationFeedback() {
    if (archiveNavigationFeedbackReady) return;
    archiveNavigationFeedbackReady = true;
    document.addEventListener("click", beginArchiveNavigationFeedback, true);
    window.addEventListener("pageshow", finishArchiveNavigationFeedback);
    window.addEventListener("popstate", pageNavigationForHistory);
    window.addEventListener("resize", updateNavigationFeedbackGeometry, { passive: true });
    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !activeArchiveNavigation) return;
      if (event.target && event.target.closest("input, textarea, [contenteditable], .md-search")) return;
      event.preventDefault();
      cancelArchiveNavigation();
    });
  }

  function setupProgressiveImages() {
    document.querySelectorAll("[data-progressive-image]").forEach(function (shell) {
      var image = shell.querySelector("img[data-progressive-full]");
      if (!image || progressiveImages.has(image)) return;
      progressiveImages.add(image);
      shell.classList.add("is-loading");
      function failed() {
        if (!shell.isConnected) return;
        shell.classList.remove("is-loading", "is-ready");
        shell.classList.add("is-error");
      }
      function loaded() {
        if (!image.complete || !image.naturalWidth) return;
        var decoded;
        try { decoded = image.decode ? image.decode() : Promise.resolve(); }
        catch (error) { failed(); return; }
        Promise.resolve(decoded).then(function () {
          if (!shell.isConnected || !image.complete || !image.naturalWidth) return;
          shell.classList.remove("is-loading", "is-error");
          shell.classList.add("is-ready");
        }).catch(failed);
      }
      image.addEventListener("load", loaded);
      image.addEventListener("error", failed);
      if (image.complete) {
        if (image.naturalWidth) loaded();
        else failed();
      }
    });
  }

  function setupPdfViewers() {
    // Content replacement must also dispose timers for detached viewers.
    activePdfViewers = activePdfViewers.filter(function (runtime) {
      if (runtime.shell.isConnected) return true;
      runtime.dispose();
      return false;
    });
    document.querySelectorAll("[data-pdf-viewer]").forEach(function (shell) {
      if (pdfViewers.has(shell)) return;
      var iframe = shell.querySelector("iframe[data-src]");
      var open = shell.querySelector("[data-pdf-open]");
      var status = shell.querySelector("[data-pdf-status]");
      if (!iframe || !open || !status) return;
      var timer = null;
      var buttonGlass = setupPdfButtonGlass(open);
      var started = false;
      var retry = document.createElement("button");
      retry.type = "button";
      retry.dataset.pdfRetry = "";
      retry.textContent = "重新加载内嵌 PDF";
      retry.hidden = true;
      open.parentNode.insertBefore(retry, open.nextSibling);
      function showStatus(message) {
        status.hidden = false;
        status.textContent = message;
      }
      function dispose() {
        if (timer !== null) window.clearTimeout(timer);
        timer = null;
        if (buttonGlass) buttonGlass.destroy();
        buttonGlass = null;
      }
      function start() {
        dispose();
        started = true;
        shell.classList.remove("is-pdf-slow", "is-pdf-error");
        shell.classList.add("is-pdf-active");
        open.hidden = true;
        retry.hidden = true;
        iframe.hidden = false;
        showStatus("正在打开内嵌 PDF。前两页预览仍可阅读，也可在新窗口打开完整文件。");
        // Never request the original PDF until explicit reader intent.
        iframe.setAttribute("src", iframe.getAttribute("data-src"));
        timer = window.setTimeout(function () {
          timer = null;
          if (!shell.isConnected) return;
          shell.classList.add("is-pdf-slow");
          retry.hidden = false;
          showStatus("如果内嵌 PDF 仍未显示，可重新加载，或在新窗口打开。前两页预览始终保留。");
        }, 10000);
      }
      iframe.addEventListener("load", function () {
        if (!started || !shell.isConnected) return;
        // Browser PDF viewers can fire load before even page 1 is available.
        // Keep previews and recovery intact; do not declare rendering complete.
        showStatus("内嵌阅读器正在初始化；PDF 页面可能仍在加载。可继续阅读预览，或在新窗口打开。");
      });
      iframe.addEventListener("error", function () {
        if (!started || !shell.isConnected) return;
        dispose();
        shell.classList.add("is-pdf-error");
        retry.hidden = false;
        showStatus("内嵌阅读器暂未打开。可重试，或在新窗口打开完整 PDF。");
      });
      open.addEventListener("click", start);
      retry.addEventListener("click", start);
      var runtime = { shell: shell, dispose: dispose };
      pdfViewers.set(shell, runtime);
      activePdfViewers.push(runtime);
    });
  }

  function classifyUiRoute(pathname, logoHref) {
    var normalizedPath = (pathname || "").replace(/\/+$/, "");
    var normalizedLogoHref = (logoHref || "").trim();
    var isRootPath = normalizedPath === "" || /^\/index\.html$/i.test(normalizedPath);
    var isRootLogo = normalizedLogoHref === "." || normalizedLogoHref === "./";

    return {
      isHomepage: isRootPath || isRootLogo,
      isHomeProfilePage: /\/HOME\/(?:Archive|friends)(?:\/index\.html)?$/i.test(normalizedPath)
    };
  }

  function updateHomepageClass() {
    if (!document.body) return;

    var logo = document.querySelector(".md-header__button.md-logo");
    var logoHref = logo ? logo.getAttribute("href") : "";
    var route = classifyUiRoute(window.location.pathname, logoHref);

    document.body.classList.toggle("is-homepage", route.isHomepage);
    document.body.classList.toggle("is-home-profile-page", route.isHomeProfilePage);

    if (route.isHomepage) {
      document.title = "Chen Jing (经宸) | Zhejiang University";
    }
  }

  /**
   * Install the progressive backdrop stack used by the translucent header.
   *
   * Material keeps the header across instant navigation, so this routine is
   * deliberately idempotent. Keeping the glass in real DOM nodes (instead of
   * header pseudo-elements) also lets each masked blur sample the document
   * independently without painting a separate hard-edged band below it.
   */
  function ensureHeaderGlass() {
    var header = document.querySelector(".md-header");
    if (!header) return;

    var glasses = Array.prototype.filter.call(header.children, function (child) {
      return child.classList && child.classList.contains("edwinos-header-glass");
    });
    var glass = glasses.shift();

    glasses.forEach(function (duplicate) {
      duplicate.remove();
    });

    if (!glass) {
      glass = document.createElement("div");
      glass.className = "edwinos-header-glass";
      glass.setAttribute("aria-hidden", "true");

      for (var layerIndex = 1; layerIndex <= 5; layerIndex += 1) {
        var layer = document.createElement("div");
        layer.className = "edwinos-header-glass__layer edwinos-header-glass__layer--" + layerIndex;
        glass.appendChild(layer);
      }

      var fade = document.createElement("div");
      fade.className = "edwinos-header-glass__fade";
      glass.appendChild(fade);
    }

    glass.setAttribute("aria-hidden", "true");
    if (header.firstElementChild !== glass) {
      header.insertBefore(glass, header.firstChild);
    }
  }

  /**
   * Add a short progressive blur directly below the sticky article TOC title.
   * Its depth is measured from the title rule to the first TOC entry and
   * capped at 12px, so the initial first entry never starts inside the glass.
   */
  function ensureTocGlass() {
    var title = document.querySelector(
      ".md-sidebar--secondary .md-nav--secondary > .md-nav__title"
    );
    var firstLink = document.querySelector(
      '.md-sidebar--secondary [data-md-component="toc"] > li > .md-nav__link'
    );
    if (!title || !firstLink) return;

    var glasses = Array.prototype.filter.call(title.children, function (child) {
      return child.classList && child.classList.contains("edwinos-toc-glass");
    });
    var glass = glasses.shift();

    glasses.forEach(function (duplicate) {
      duplicate.remove();
    });

    if (!glass) {
      glass = document.createElement("span");
      glass.className = "edwinos-toc-glass";
      glass.setAttribute("aria-hidden", "true");

      for (var layerIndex = 1; layerIndex <= 5; layerIndex += 1) {
        var layer = document.createElement("span");
        layer.className = "edwinos-toc-glass__layer edwinos-toc-glass__layer--" + layerIndex;
        glass.appendChild(layer);
      }

      var fade = document.createElement("span");
      fade.className = "edwinos-toc-glass__fade";
      glass.appendChild(fade);
      title.appendChild(glass);
    }

    var titleBottom = title.getBoundingClientRect().bottom;
    var firstTop = firstLink.getBoundingClientRect().top;
    var availableGap = Math.max(0, firstTop - titleBottom);
    title.style.setProperty(
      "--edwinos-toc-glass-depth",
      Math.min(12, Math.floor(availableGap)) + "px"
    );
  }

  function beginHeaderSearchTransition() {
    if (headerSearchRuntime) headerSearchRuntime.arm();
  }

  var searchMeasureCanvas = document.createElement('canvas');
  var searchMeasureContext = searchMeasureCanvas.getContext('2d');

  function decorateSearchResults(search) {
    search.querySelectorAll('.md-search-result__item').forEach(function (group) {
      var parent = group.querySelector('.md-search-result__article h1');
      if (!parent) return;
      var article = parent.closest('.md-search-result__article');
      var name = parent.dataset.edwinosArticleName || parent.textContent;
      parent.dataset.edwinosArticleName = name;
      group.querySelectorAll('.md-search-result__article h2').forEach(function (heading) {
        if (heading.querySelector('.edwinos-search-provenance')) return;
        var source = document.createElement('span');
        source.className = 'edwinos-search-provenance';
        source.textContent = ' · ' + name;
        heading.appendChild(source);
      });
      // A score-zero parent is grouping metadata, rather than a real hit.
      if (article.dataset.mdScore === '0.00' && group.querySelector('h2')) parent.closest('a').hidden = true;
    });
  }

  function fitSearchSnippets(search) {
    var started = window.performance.now();
    decorateSearchResults(search);
    var scrollwrap = search.querySelector('.md-search__scrollwrap');
    var viewport = scrollwrap && scrollwrap.getBoundingClientRect();
    search.querySelectorAll('.md-search-result__article p').forEach(function (paragraph) {
      var box = paragraph.getBoundingClientRect();
      if (!box.width || !box.height || paragraph.closest('details:not([open])') ||
          viewport && (box.bottom < viewport.top - 96 || box.top > viewport.bottom + 96)) return;
      var source = searchSnippetSources.get(paragraph);
      if (!source) {
        var excerpts = Array.from(paragraph.querySelectorAll('[data-edwinos-search-segment]'));
        if (!excerpts.length) excerpts = [paragraph];
        source = { width: '', segments: excerpts.map(function (excerpt) {
          var text = '', marks = [], codes = [];
          function collect(node, marked, coded) {
            if (node.nodeType === 3) {
              var start = text.length;
              text += node.textContent;
              if (marked) marks.push({ start: start, end: text.length });
              if (coded) codes.push({ start: start, end: text.length });
            } else if (node.nodeType === 1) {
              node.childNodes.forEach(function (child) { collect(child, marked || node.tagName === 'MARK', coded || node.tagName === 'CODE' || node.tagName === 'PRE'); });
            }
          }
          excerpt.childNodes.forEach(function (node) { collect(node, false); });
          var boundaries = [0], offset = 0;
          var graphemes = typeof Intl.Segmenter === 'function'
            ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), function (part) { return part.segment; })
            : Array.from(text);
          graphemes.forEach(function (grapheme) { offset += grapheme.length; boundaries.push(offset); });
          codes = codes.reduce(function (ranges, code) {
            var previous = ranges[ranges.length - 1];
            if (previous && code.start <= previous.end) previous.end = code.end;
            else ranges.push(code);
            return ranges;
          }, []);
          return { text: text, marks: marks, codes: codes, boundaries: boundaries,
            leading: excerpt.dataset.startTruncated === 'true', trailing: excerpt.dataset.endTruncated === 'true' };
        }) };
        searchSnippetSources.set(paragraph, source);
      }
      var width = Math.round(box.width), style = window.getComputedStyle(paragraph);
      var font = style.font || style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily;
      var codeElement = paragraph.querySelector && paragraph.querySelector('code');
      var codeStyle = codeElement && window.getComputedStyle(codeElement);
      var codeFont = codeStyle ? codeStyle.font || codeStyle.fontWeight + ' ' + codeStyle.fontSize + ' ' + codeStyle.fontFamily : font;
      var signature = width + ':' + font + ':' + codeFont + ':' + style.lineHeight;
      if (signature === source.width) return;
      source.width = signature;
      var math = window.EdwinOSSearchMath;
      if (math) math.clear(paragraph);
      var ranges = source.segments.map(function (segment) { return math ? math.getRanges(segment.text, segment.codes) : []; });
      function bounds(segment, index, context) {
        var first = segment.marks.length ? segment.marks[0].start : 0;
        var last = segment.marks.length ? segment.marks[0].end : 0;
        var start = Math.max(0, first - context), end = Math.min(segment.text.length, last + context);
        start = segment.boundaries.filter(function (boundary) { return boundary <= start; }).pop();
        end = segment.boundaries.find(function (boundary) { return boundary >= end; });
        while (start > 0 && /[A-Za-z0-9_]/.test(segment.text[start - 1] || '') && /[A-Za-z0-9_]/.test(segment.text[start] || '')) start--;
        while (end < segment.text.length && /[A-Za-z0-9_]/.test(segment.text[end - 1] || '') && /[A-Za-z0-9_]/.test(segment.text[end] || '')) end++;
        ranges[index].forEach(function (range) {
          if (start > range.start && start < range.end) start = range.end <= first ? range.end : range.start;
          if (end > range.start && end < range.end) end = range.start >= last ? range.start : range.end;
        });
        // Marks are atomic too; a later match may touch the context boundary.
        segment.marks.forEach(function (mark) {
          if (start > mark.start && start < mark.end) start = mark.start;
          if (end > mark.start && end < mark.end) end = mark.end;
        });
        return { start: start, end: end };
      }
      function select(count, context) {
        return source.segments.slice(0, count).map(function (segment, index) { return bounds(segment, index, context); });
      }
      function measure(selected) {
        var total = 0;
        function add(text, coded) {
          searchMeasureContext.font = coded ? codeFont : font;
          total += searchMeasureContext.measureText(text).width;
        }
        selected.forEach(function (range, index) {
          var segment = source.segments[index], cursor = range.start;
          if (index) add(' ... ', false);
          else if (range.start || segment.leading) add('...', false);
          segment.codes.forEach(function (code) {
            var left = Math.max(range.start, code.start), right = Math.min(range.end, code.end);
            if (left >= right) return;
            add(segment.text.slice(cursor, left), false);
            add(segment.text.slice(left, right), true);
            cursor = right;
          });
          add(segment.text.slice(cursor, range.end), false);
        });
        var lastIndex = selected.length - 1;
        if (selected.length < source.segments.length || source.segments[lastIndex].trailing || selected[lastIndex].end < source.segments[lastIndex].text.length) add('...', false);
        return total;
      }
      // Reserve short context for the first occurrence, then later excerpts,
      // before spending the remaining two-line budget on richer context.
      var count = 1, budget = width * 2 * 0.92;
      if (searchMeasureContext) {
        searchMeasureContext.font = font;
        while (count < source.segments.length && measure(select(count + 1, 8)) <= budget) count++;
      }
      var low = 8, high = source.segments.reduce(function (largest, segment) { return Math.max(largest, segment.text.length); }, 0);
      if (searchMeasureContext) {
        while (low < high) {
          var middle = Math.ceil((low + high) / 2);
          if (measure(select(count, middle)) <= budget) low = middle;
          else high = middle - 1;
        }
      } else low = 40;
      var selected = select(count, low), nodes = [];
      selected.forEach(function (range, index) {
        var segment = source.segments[index];
        if (index) nodes.push(document.createTextNode(' ... '));
        else if (range.start || segment.leading) nodes.push(document.createTextNode('...'));
        var excerpt = document.createElement('span');
        excerpt.dataset.edwinosSearchSegment = String(index);
        function appendText(parent, start, end) {
          var cursor = start;
          segment.marks.forEach(function (mark) {
            var left = Math.max(start, mark.start), right = Math.min(end, mark.end);
            if (left >= right) return;
            parent.appendChild(document.createTextNode(segment.text.slice(cursor, left)));
            var highlight = document.createElement('mark');
            highlight.textContent = segment.text.slice(left, right);
            parent.appendChild(highlight);
            cursor = right;
          });
          parent.appendChild(document.createTextNode(segment.text.slice(cursor, end)));
        }
        var cursor = range.start;
        segment.codes.forEach(function (code) {
          var left = Math.max(range.start, code.start), right = Math.min(range.end, code.end);
          if (left >= right) return;
          appendText(excerpt, cursor, left);
          var element = document.createElement('code');
          appendText(element, left, right);
          excerpt.appendChild(element);
          cursor = right;
        });
        appendText(excerpt, cursor, range.end);
        nodes.push(excerpt);
      });
      var lastIndex = selected.length - 1;
      if (count < source.segments.length || source.segments[lastIndex].trailing || selected[lastIndex].end < source.segments[lastIndex].text.length) {
        nodes.push(document.createTextNode('...'));
      }
      paragraph.replaceChildren.apply(paragraph, nodes);
    });
    search.dataset.edwinosSearchFitMs = String(Math.round((window.performance.now() - started) * 100) / 100);
    document.dispatchEvent(new CustomEvent('edwinos:search-snippets-updated', { detail: { root: search } }));
  }

  /* Pure geometry shared by glass components. Only the perimeter bends;
     neutral center pixels retain the continuous background blur. Technique
     attribution: assets/licenses/liquid-glass-MIT.txt. */
  function fillRoundedGlassDisplacementMap(pixels, width, height, padding, radius) {
    var sampleWidth = width + padding * 2;
    var sampleHeight = height + padding * 2;
    var rim = Math.min(7, radius * 0.4);
    for (var y = 0; y < pixels.height; y += 1) {
      for (var x = 0; x < pixels.width; x += 1) {
        var px = (x + 0.5) * sampleWidth / pixels.width - padding;
        var py = (y + 0.5) * sampleHeight / pixels.height - padding;
        var axisX = Math.max(radius, Math.min(width - radius, px));
        var axisY = Math.max(radius, Math.min(height - radius, py));
        var vx = px - axisX;
        var vy = py - axisY;
        var length = Math.hypot(vx, vy);
        var depth = radius - length;
        var dx = 0;
        var dy = 0;
        if (depth < rim && length > 0) {
          // Outward source ordering stays monotonic at every amplitude.
          var t = Math.max(0, Math.min(1, depth / rim));
          var profile = 1 - 3 * t * t + 2 * t * t * t;
          dx = vx / length * profile;
          dy = vy / length * profile;
        }
        var index = (y * pixels.width + x) * 4;
        pixels.data[index] = Math.round(127.5 + dx * 127.5);
        pixels.data[index + 1] = Math.round(127.5 + dy * 127.5);
        pixels.data[index + 2] = 128;
        pixels.data[index + 3] = 255;
      }
    }
    return pixels;
  }

  function setupHeaderSearchTransition() {
    var header = document.querySelector(".md-header");
    var search = header ? header.querySelector(".md-search") : null;
    var form = search ? search.querySelector(".md-search__form") : null;
    var input = form ? form.querySelector(".md-search__input") : null;
    var searchToggle = document.querySelector('[data-md-toggle="search"]');
    if (headerSearchRuntime && headerSearchRuntime.header === header &&
        headerSearchRuntime.search === search && headerSearchRuntime.form === form &&
        headerSearchRuntime.input === input && headerSearchRuntime.toggle === searchToggle) {
      headerSearchRuntime.refresh();
      return;
    }
    if (headerSearchRuntime) headerSearchRuntime.destroy();
    headerSearchRuntime = null;
    if (!header || !search || !form || !input || !searchToggle) return;

    var svgNS = "http://www.w3.org/2000/svg";
    var filterId = "edwinos-search-refraction";
    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var canvas = null;
    var context = null;
    var definitions = null;
    var filter = null;
    var mapImage = null;
    var displacement = null;
    var cache = new Map();
    var listeners = [];
    var timers = new Set();
    var observers = [];
    var frame = 0;
    var focusFrame = 0;
    var activationFrame = 0;
    var focusGeneration = 0;
    var reopenBlockedUntil = 0;
    var until = 0;
    var disposed = false;
    var layoutFrame = 0;
    var resultHeight = 0;
    var mapKey = "";
    var restWidth = 44;
    var openWidth = 44;
    var currentA = 0;
    var maximumA = 0;
    var frames = 0;
    var mapBuilds = 0;
    var maximumMapTime = 0;
    var progress = 0;
    var round = function (value) { return Math.round(value * 100) / 100; };

    var chromium = /\b(?:Chrome|Chromium|Edg|EdgA|OPR)\//.test(window.navigator.userAgent);
    var refraction = chromium && window.CSS && typeof window.CSS.supports === "function" &&
      window.CSS.supports("backdrop-filter", "url(#" + filterId + ")") &&
      typeof window.SVGFEImageElement !== "undefined" && typeof window.SVGFEDisplacementMapElement !== "undefined";
    if (refraction) {
      canvas = document.createElement("canvas");
      context = canvas.getContext("2d");
      refraction = Boolean(context);
    }

    function listen(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      listeners.push(function () { target.removeEventListener(type, callback, options); });
    }

    function timer(callback, delay) {
      var id = window.setTimeout(function () {
        timers.delete(id);
        if (!disposed) callback();
      }, delay);
      timers.add(id);
      return id;
    }

    var shell = form.parentElement.querySelector('.edwinos-search-shell');
    if (!shell) {
      shell = document.createElement('div');
      shell.className = 'edwinos-search-shell';
      shell.setAttribute('aria-hidden', 'true');
      form.parentElement.insertBefore(shell, form);
    }

    function addGlass(kind) {
      var selector = ".edwinos-search-glass--" + kind;
      var layer = shell.querySelector(selector) || form.querySelector(selector);
      if (!layer) {
        layer = document.createElement("span");
        layer.className = "edwinos-search-glass edwinos-search-glass--" + kind;
        layer.setAttribute("aria-hidden", "true");
      }
      shell.appendChild(layer);
      return layer;
    }

    var surface = addGlass("surface");
    var highlight = addGlass("highlight");
    search.classList.toggle("edwinos-search-refraction", refraction);
    search.dataset.edwinosSearchMode = refraction ? "refraction" : "native-blur";

    if (refraction) {
      definitions = document.createElementNS(svgNS, "svg");
      definitions.setAttribute("width", "0");
      definitions.setAttribute("height", "0");
      definitions.setAttribute("aria-hidden", "true");
      definitions.style.cssText = "position:fixed;left:0;top:0;pointer-events:none;overflow:hidden";
      var defs = document.createElementNS(svgNS, "defs");
      filter = document.createElementNS(svgNS, "filter");
      filter.setAttribute("id", filterId);
      filter.setAttribute("filterUnits", "userSpaceOnUse");
      filter.setAttribute("color-interpolation-filters", "sRGB");
      filter.setAttribute("x", "0");
      filter.setAttribute("y", "0");
      mapImage = document.createElementNS(svgNS, "feImage");
      mapImage.setAttribute("result", "edwinos-search-map");
      mapImage.setAttribute("preserveAspectRatio", "none");
      mapImage.setAttribute("x", "0");
      mapImage.setAttribute("y", "0");
      displacement = document.createElementNS(svgNS, "feDisplacementMap");
      displacement.setAttribute("in", "SourceGraphic");
      displacement.setAttribute("in2", "edwinos-search-map");
      displacement.setAttribute("xChannelSelector", "R");
      displacement.setAttribute("yChannelSelector", "G");
      filter.appendChild(mapImage);
      filter.appendChild(displacement);
      defs.appendChild(filter);
      definitions.appendChild(defs);
      document.body.appendChild(definitions);
    }

    function measureEndpoints() {
      var box = header.getBoundingClientRect();
      var palette = header.querySelector(".md-header__option");
      var control = palette ? palette.querySelector('.md-header__button:not([hidden])') : null;
      var icon = control ? control.querySelector("svg") : null;
      var controlBox = control ? control.getBoundingClientRect() : null;
      var iconBox = icon ? icon.getBoundingClientRect() : null;
      var probe = document.createElement("span");
      probe.style.cssText = "position:absolute;left:var(--edwinos-header-edge);width:0;pointer-events:none";
      header.appendChild(probe);
      var edge = probe.getBoundingClientRect().left - box.left;
      probe.remove();
      var right = edge;
      if (controlBox && controlBox.height > 2 && iconBox && iconBox.width > 0) {
        // Keep the horizontal target based on REST control geometry. The open
        // height can grow without changing the previously verified width.
        var radius = (controlBox.height - 2) / 2;
        var top = box.top + (box.height - controlBox.height) / 2 + 1;
        var curveInset = function (y) {
          var distance = Math.min(radius, Math.abs(y - top - radius));
          return radius - Math.sqrt(Math.max(0, radius * radius - distance * distance));
        };
        var allowance = Math.max(curveInset(iconBox.top), curveInset(iconBox.bottom));
        right = Math.max(2, Math.min(edge, box.right - iconBox.right - allowance - 3));
      }
      header.style.setProperty("--edwinos-header-search-open-right", right + "px");
      probe = document.createElement("span");
      probe.style.cssText = "position:absolute;left:var(--edwinos-header-search-rest-left);right:var(--edwinos-header-search-right);height:0;pointer-events:none";
      header.appendChild(probe);
      restWidth = probe.getBoundingClientRect().width;
      probe.remove();
      openWidth = box.width - edge - right;
    }

    /* Capsule map technique informed by Shu Ding's liquid-glass (2025, MIT).
       The full attribution/license is in assets/licenses/liquid-glass-MIT.txt. */
    function makeMap(width, height, padding, radius) {
      var key = Math.round(width) + ":" + Math.round(height) + ":" + padding + ':' + Math.round(radius);
      if (cache.has(key)) {
        var cached = cache.get(key);
        cache.delete(key);
        cache.set(key, cached);
        return cached;
      }
      var started = window.performance.now();
      var sampleWidth = width + padding * 2;
      var sampleHeight = height + padding * 2;
      var columns = Math.min(768, Math.max(24, Math.ceil(sampleWidth * 0.65)));
      var rows = Math.min(512, Math.max(24, Math.ceil(sampleHeight * 0.65)));
      canvas.width = columns;
      canvas.height = rows;
      var pixels = context.createImageData(columns, rows);
      fillRoundedGlassDisplacementMap(pixels, width, height, padding, radius);
      context.putImageData(pixels, 0, 0);
      var url = canvas.toDataURL("image/png");
      cache.set(key, url);
      if (cache.size > 12) cache.delete(cache.keys().next().value);
      mapBuilds += 1;
      maximumMapTime = Math.max(maximumMapTime, window.performance.now() - started);
      return url;
    }

    function paint() {
      var box = shell.getBoundingClientRect();
      var searchBox = search.getBoundingClientRect();
      var inputHeight = form.getBoundingClientRect().height;
      search.style.setProperty('--edwinos-search-input-height', inputHeight + 'px');
      // Follow the rendered input/results, rather than animating their already
      // animated heights a second time (which made an empty capsule grow late).
      var output = search.querySelector('.md-search__output');
      var visibleResultHeight = output ? output.getBoundingClientRect().height : 0;
      search.style.setProperty('--edwinos-search-shell-height', inputHeight + visibleResultHeight + 'px');
      var span = openWidth - restWidth;
      progress = span > 0 ? Math.max(0, Math.min(1, (searchBox.width - restWidth) / span)) : 0;
      var extension = resultHeight ? Math.max(0, Math.min(1, (box.height - form.getBoundingClientRect().height) / resultHeight)) : 0;
      currentA = refraction ? 6 * (1 + 0.35 * Math.max(Math.sin(Math.PI * progress), Math.sin(Math.PI * extension))) : 0;
      maximumA = Math.max(maximumA, currentA);
      var radius = Math.min(box.width / 2, box.height / 2, parseFloat(window.getComputedStyle(shell).borderTopLeftRadius) || 24);
      search.style.setProperty("--edwinos-search-sample-padding", "29px");
      search.style.setProperty("--edwinos-search-form-radius", radius + "px");
      if (refraction && box.width > 0 && box.height > 0) {
        var key = Math.round(box.width) + ":" + Math.round(box.height) + ":29:" + Math.round(radius);
        filter.setAttribute("width", box.width + 58);
        filter.setAttribute("height", box.height + 58);
        mapImage.setAttribute("width", box.width + 58);
        mapImage.setAttribute("height", box.height + 58);
        displacement.setAttribute("scale", currentA * 2);
        if (key !== mapKey) {
          var url = makeMap(box.width, box.height, 29, radius);
          mapImage.setAttribute("href", url);
          mapImage.setAttributeNS("http://www.w3.org/1999/xlink", "href", url);
          mapKey = key;
        }
      }
      frames += 1;
      search.dataset.edwinosSearchCurrentA = String(round(currentA));
      search.dataset.edwinosSearchMaxRecordedA = String(round(maximumA));
      search.dataset.edwinosSearchProgress = String(round(progress));
      search.dataset.edwinosSearchFrames = String(frames);
      search.dataset.edwinosSearchRestWidth = String(round(restWidth));
      search.dataset.edwinosSearchOpenWidth = String(round(openWidth));
      search.dataset.edwinosSearchMapBuilds = String(mapBuilds);
      search.dataset.edwinosSearchMapMaxMs = String(round(maximumMapTime));
      search.dataset.edwinosSearchWidth = String(round(searchBox.width));
      search.dataset.edwinosSearchHeight = String(round(searchBox.height));
      search.dataset.edwinosSearchOpen = searchToggle.checked ? "1" : "0";
    }

    function tick(now) {
      frame = 0;
      if (disposed || !search.isConnected) return;
      paint();
      if (!reducedMotion.matches && now < until) {
        frame = window.requestAnimationFrame(tick);
      } else {
        search.dataset.edwinosSearchIdle = "1";
        document.documentElement.classList.remove("edwinos-search-transitioning");
      }
    }

    function schedule(duration, reset) {
      if (disposed) return;
      var now = window.performance.now();
      if (reset) {
        maximumA = 0;
        frames = 0;
      }
      until = reducedMotion.matches ? now : Math.max(until, now + duration);
      search.dataset.edwinosSearchIdle = "0";
      if (reducedMotion.matches) document.documentElement.classList.remove("edwinos-search-transitioning");
      else if (duration > 0) document.documentElement.classList.add("edwinos-search-transitioning");
      if (!frame) frame = window.requestAnimationFrame(tick);
    }

    function arm() {
      measureEndpoints();
      // Commit rest before a native label/Material callback changes checked.
      search.getBoundingClientRect();
      schedule(500, true);
    }

    function cancelFocus() {
      focusGeneration += 1;
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(activationFrame);
      focusFrame = 0;
      activationFrame = 0;
      reopenBlockedUntil = window.performance.now() + 80;
    }

    function deferActivation(callback) {
      window.cancelAnimationFrame(activationFrame);
      var generation = focusGeneration;
      activationFrame = window.requestAnimationFrame(function () {
        activationFrame = 0;
        if (!disposed && generation === focusGeneration && search.isConnected &&
            window.performance.now() >= reopenBlockedUntil) callback();
      });
    }

    function focusInput(callback) {
      window.cancelAnimationFrame(focusFrame);
      var generation = focusGeneration;
      focusFrame = window.requestAnimationFrame(function () {
        focusFrame = 0;
        if (disposed || generation !== focusGeneration || !searchToggle.checked || !search.isConnected) return;
        input.focus({ preventScroll: true });
        if (callback) callback();
      });
    }

    function refresh() {
      measureEndpoints();
      updateResults();
      schedule(searchToggle.checked ? 500 : 0, true);
    }

    function updateResults() {
      if (layoutFrame || disposed) return;
      layoutFrame = window.requestAnimationFrame(function () {
        layoutFrame = 0;
        if (searchToggle.checked && input.value.trim()) fitSearchSnippets(search);
        var inputHeight = form.getBoundingClientRect().height;
        var result = search.querySelector('.md-search-result');
        var viewport = window.visualViewport;
        var bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        var available = Math.max(0, bottom - form.getBoundingClientRect().bottom - 12);
        var scrollwrap = search.querySelector('.md-search__scrollwrap');
        var inset = scrollwrap ? parseFloat(window.getComputedStyle(scrollwrap).paddingBottom) || 0 : 0;
        resultHeight = searchToggle.checked && input.value.trim() && result
          ? Math.min(result.scrollHeight + inset, available, window.innerHeight * 0.68, 640) : 0;
        search.style.setProperty('--edwinos-search-input-height', inputHeight + 'px');
        search.style.setProperty('--edwinos-search-results-height', resultHeight + 'px');
        schedule(searchToggle.checked ? 500 : 0, false);
      });
    }

    listen(header, "pointerdown", function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      if (target && target.closest('.md-search__form, [for="__search"]')) {
        reopenBlockedUntil = 0;
        arm();
      }
    }, true);
    listen(header, "click", function (event) {
      var target = event.target && event.target.closest ? event.target : null;
      if (target && target.closest('[for="__search"]')) arm();
    }, true);
    listen(searchToggle, "change", function () {
      if (searchToggle.checked && window.performance.now() < reopenBlockedUntil) {
        searchToggle.checked = false;
        searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
        return;
      }
      if (!searchToggle.checked) {
        cancelFocus();
        input.blur();
      }
      updateResults();
      schedule(500, true);
    });

    if (typeof window.ResizeObserver === "function") {
      var resize = new ResizeObserver(refresh);
      resize.observe(header);
      var result = search.querySelector('.md-search-result');
      if (result) resize.observe(result);
      observers.push(resize);
    } else {
      listen(window, "resize", refresh);
    }
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', updateResults);
      listen(window.visualViewport, 'scroll', updateResults);
    }
    listen(document, 'edwinos:search-math-settled', updateResults);
    var resultsScroller = search.querySelector('.md-search__scrollwrap');
    if (resultsScroller) listen(resultsScroller, 'scroll', updateResults, { passive: true });
    var resultsOutput = search.querySelector('.md-search__output');
    if (resultsOutput) {
      listen(resultsOutput, 'transitionend', function (event) {
        if (event.propertyName === 'height') updateResults();
      });
      listen(resultsOutput, 'toggle', updateResults, true);
    }
    if (typeof window.MutationObserver === "function") {
      var paletteObserver = new MutationObserver(refresh);
      var palette = header.querySelector(".md-header__option");
      var source = header.querySelector(".md-header__source");
      [palette, source].forEach(function (element) {
        if (element) paletteObserver.observe(element, { attributes: true, attributeFilter: ["hidden", "style", "d", "transform"], childList: true, subtree: true });
      });
      observers.push(paletteObserver);
      var schemeObserver = new MutationObserver(refresh);
      schemeObserver.observe(document.body, { attributes: true, attributeFilter: ["data-md-color-scheme"] });
      observers.push(schemeObserver);
    }
    if (typeof reducedMotion.addEventListener === "function") listen(reducedMotion, "change", refresh);
    else if (typeof reducedMotion.addListener === "function") {
      reducedMotion.addListener(refresh);
      listeners.push(function () { reducedMotion.removeListener(refresh); });
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { if (!disposed) refresh(); });
    }

    headerSearchRuntime = {
      header: header, search: search, form: form, input: input, toggle: searchToggle, arm: arm, refresh: refresh,
      listen: listen, timer: timer, cancelFocus: cancelFocus, updateResults: updateResults,
      deferActivation: deferActivation, focusInput: focusInput,
      allowOpen: function () { reopenBlockedUntil = 0; },
      destroy: function () {
        disposed = true;
        cancelFocus();
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(layoutFrame);
        observers.forEach(function (observer) { observer.disconnect(); });
        listeners.forEach(function (remove) { remove(); });
        timers.forEach(function (id) { window.clearTimeout(id); });
        cache.clear();
        if (definitions) definitions.remove();
        surface.remove();
        highlight.remove();
        shell.remove();
        search.classList.remove("edwinos-search-refraction");
        delete search.dataset.edwinosSearchReady;
        delete form.dataset.edwinosSearchFormReady;
        document.documentElement.classList.remove("edwinos-search-transitioning");
      }
    };
    refresh();
  }

  function closeSearchWhenClickingAway() {
    document.addEventListener("click", function (event) {
      var searchToggle = document.querySelector('[data-md-toggle="search"]');
      if (!searchToggle || !searchToggle.checked) return;

      var target = event.target && event.target.nodeType === 1
        ? event.target
        : event.target && event.target.parentElement;
      if (!target) return;

      var search = document.querySelector(".md-search");
      var searchControl = target.closest ? target.closest('[for="__search"]') : null;
      if (searchControl && !searchControl.classList.contains("md-search__overlay")) return;
      if (searchControl && searchControl.classList.contains("md-search__overlay")) {
        event.preventDefault();
      }

      if (search && search.contains(target)) {
        var interactiveSearchContent = target.closest(
          ".md-search__form, .md-search__options, .md-search-result__item, .md-search-result__link"
        );
        if (interactiveSearchContent) return;
      }

      if (headerSearchRuntime) headerSearchRuntime.cancelFocus();
      beginHeaderSearchTransition();
      searchToggle.checked = false;
      searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function createSearchQueryMemory() {
    // One same-origin memory survives document/navigation boundaries. A reload
    // publishes a new reset token even when the remembered query is already empty.
    var state = { query: "", reset: "" }, notifyReset = null;
    function readStored() {
      try {
        var value = JSON.parse(window.localStorage.getItem(SEARCH_QUERY_STORAGE_KEY));
        if (value && typeof value.query === "string" && typeof value.reset === "string") return value;
      } catch (_error) { /* Storage restrictions leave a usable document-local memory. */ }
      return state;
    }
    function receive(value) {
      var changed = value.reset !== state.reset;
      state = value;
      if (changed && notifyReset) notifyReset();
      return state.query;
    }
    function write(value) {
      state = value;
      try { window.localStorage.setItem(SEARCH_QUERY_STORAGE_KEY, JSON.stringify(state)); }
      catch (_error) { /* Retain the in-memory fallback. */ }
    }
    state = readStored();
    var navigation = window.performance.getEntriesByType && window.performance.getEntriesByType("navigation")[0];
    var reloaded = Boolean(navigation && navigation.type === "reload");
    if (reloaded) write({ query: "", reset: Date.now().toString(36) + ":" + Math.random().toString(36).slice(2) });
    window.addEventListener("storage", function (event) {
      if (event.key === SEARCH_QUERY_STORAGE_KEY || event.key === null) {
        // Read the current value rather than an older queued event payload.
        receive(readStored());
      }
    });
    window.addEventListener("pageshow", function () { receive(readStored()); });
    return {
      reloaded: reloaded,
      read: function () { return receive(readStored()); },
      save: function (query) {
        var latest = readStored();
        // A queued cross-tab reset wins over input from its previous generation.
        if (latest.reset !== state.reset) { receive(latest); return; }
        if (latest.query !== query) write({ query: query, reset: latest.reset });
      },
      onReset: function (callback) { notifyReset = callback; }
    };
  }

  function setupSearchResultSummary() {
    if (searchResultSummarySubscription || !window.component$) return;

    searchResultSummarySubscription = window.component$.subscribe(function (state) {
      if (!state.ref || !state.ref.matches('[data-md-component="search-result"]') ||
          !Array.isArray(state.items)) return;
      var meta = state.ref.querySelector(".md-search-result__meta");
      if (!meta) return;

      // Use the full result payload: Material renders later articles lazily.
      // A score-zero parent only supplies its article title, not a matching entry.
      var matches = state.items.reduce(function (total, group) {
        return total + group.filter(function (item) { return item.score > 0; }).length;
      }, 0);
      if (state.items.length) {
        meta.textContent = "找到 " + state.items.length + " 篇文章，共 " + matches + " 个匹配词条";
      }
      if (headerSearchRuntime) headerSearchRuntime.updateResults();
    });
  }

  function setupTopGlass() {
    var button = document.querySelector('[data-md-component="top"]');
    if (topGlassRuntime && topGlassRuntime.button === button) return;
    if (topGlassRuntime) topGlassRuntime.destroy();
    topGlassRuntime = null;
    if (!button) return;

    var svgNS = 'http://www.w3.org/2000/svg';
    var filterId = 'edwinos-top-refraction';
    var padding = 16;
    var disposed = false;
    var frame = 0;
    var mapKey = '';
    var builds = 0;
    var definitions = null;
    var resizeObserver = null;
    var chromium = /\b(?:Chrome|Chromium|Edg|EdgA|OPR)\//.test(window.navigator.userAgent);
    var refraction = chromium && window.CSS && typeof window.CSS.supports === 'function' &&
      window.CSS.supports('backdrop-filter', 'url(#' + filterId + ')') &&
      typeof window.SVGFEImageElement !== 'undefined' && typeof window.SVGFEDisplacementMapElement !== 'undefined';
    var canvas = refraction ? document.createElement('canvas') : null;
    var context = canvas ? canvas.getContext('2d') : null;
    refraction = Boolean(context);

    function addLayer(kind) {
      var layer = button.querySelector('.edwinos-top-glass__' + kind);
      if (!layer) {
        layer = document.createElement('span');
        layer.className = 'edwinos-top-glass__' + kind;
        layer.setAttribute('aria-hidden', 'true');
        button.appendChild(layer);
      }
      return layer;
    }
    // Keep the backdrop on the button itself: an opacity transition on this
    // parent would otherwise isolate a child's backdrop from the page.
    button.querySelectorAll('.edwinos-top-glass__surface').forEach(function (layer) { layer.remove(); });
    var highlight = addLayer('highlight');
    button.classList.add('edwinos-top-glass');
    button.classList.toggle('edwinos-top-refraction', refraction);
    button.dataset.edwinosTopMode = refraction ? 'refraction' : 'native-blur';

    var filter;
    var mapImage;
    if (refraction) {
      definitions = document.createElementNS(svgNS, 'svg');
      definitions.setAttribute('width', '0');
      definitions.setAttribute('height', '0');
      definitions.setAttribute('aria-hidden', 'true');
      definitions.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;overflow:hidden';
      var defs = document.createElementNS(svgNS, 'defs');
      filter = document.createElementNS(svgNS, 'filter');
      filter.setAttribute('id', filterId);
      filter.setAttribute('filterUnits', 'userSpaceOnUse');
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      filter.setAttribute('x', String(-padding));
      filter.setAttribute('y', String(-padding));
      mapImage = document.createElementNS(svgNS, 'feImage');
      mapImage.setAttribute('result', 'edwinos-top-map');
      mapImage.setAttribute('preserveAspectRatio', 'none');
      mapImage.setAttribute('x', String(-padding));
      mapImage.setAttribute('y', String(-padding));
      var blur = document.createElementNS(svgNS, 'feGaussianBlur');
      blur.setAttribute('in', 'SourceGraphic');
      blur.setAttribute('stdDeviation', '4');
      blur.setAttribute('result', 'edwinos-top-blur');
      var displacement = document.createElementNS(svgNS, 'feDisplacementMap');
      displacement.setAttribute('in', 'edwinos-top-blur');
      displacement.setAttribute('in2', 'edwinos-top-map');
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      displacement.setAttribute('scale', '22');
      filter.appendChild(mapImage);
      filter.appendChild(blur);
      filter.appendChild(displacement);
      defs.appendChild(filter);
      definitions.appendChild(defs);
      document.body.appendChild(definitions);
    }

    function update() {
      frame = 0;
      if (disposed || !button.isConnected || !refraction) return;
      var box = button.getBoundingClientRect();
      if (!(box.width > 0 && box.height > 0)) return;
      var radius = Math.min(box.width / 2, box.height / 2,
        parseFloat(window.getComputedStyle(button).borderTopLeftRadius) || 24);
      var key = Math.round(box.width) + ':' + Math.round(box.height) + ':' + Math.round(radius);
      if (key === mapKey) return;
      var sampleWidth = box.width + padding * 2;
      var sampleHeight = box.height + padding * 2;
      canvas.width = Math.min(768, Math.max(24, Math.ceil(sampleWidth * 1.5)));
      canvas.height = Math.min(512, Math.max(24, Math.ceil(sampleHeight * 1.5)));
      var pixels = context.createImageData(canvas.width, canvas.height);
      fillRoundedGlassDisplacementMap(pixels, box.width, box.height, padding, radius);
      context.putImageData(pixels, 0, 0);
      var url = canvas.toDataURL('image/png');
      filter.setAttribute('width', sampleWidth);
      filter.setAttribute('height', sampleHeight);
      mapImage.setAttribute('width', sampleWidth);
      mapImage.setAttribute('height', sampleHeight);
      mapImage.setAttribute('href', url);
      mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      button.style.setProperty('--edwinos-top-radius', radius + 'px');
      mapKey = key;
      builds += 1;
      button.dataset.edwinosTopMapBuilds = String(builds);
    }
    function schedule() {
      if (!disposed && refraction && !frame) frame = window.requestAnimationFrame(update);
    }
    if (refraction) {
      window.addEventListener('resize', schedule, { passive: true });
      if (typeof window.ResizeObserver === 'function') {
        resizeObserver = new window.ResizeObserver(schedule);
        resizeObserver.observe(button);
      }
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(schedule);
      schedule();
    }
    topGlassRuntime = {
      button: button,
      destroy: function () {
        disposed = true;
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        if (resizeObserver) resizeObserver.disconnect();
        if (definitions) definitions.remove();
        highlight.remove();
        button.classList.remove('edwinos-top-glass', 'edwinos-top-refraction');
        delete button.dataset.edwinosTopMode;
        delete button.dataset.edwinosTopMapBuilds;
        button.style.removeProperty('--edwinos-top-radius');
      }
    };
  }

  function setupSearchActivation() {
    var search = document.querySelector(".md-search");
    var input = search ? search.querySelector(".md-search__input") : null;
    var form = search ? search.querySelector(".md-search__form") : null;
    var output = search ? search.querySelector(".md-search__output") : null;
    var searchToggle = document.querySelector('[data-md-toggle="search"]');
    var runtime = headerSearchRuntime;

    if (!search || !input || !form || !output || !searchToggle || !runtime ||
        runtime.search !== search || search.dataset.edwinosSearchReady === "1") return;
    search.dataset.edwinosSearchReady = "1";
    input.placeholder = "Search";
    input.setAttribute("aria-label", "Search");

    var searchTrigger = document.querySelector('.md-header__button[for="__search"]');
    if (searchTrigger) {
      searchTrigger.setAttribute("title", "Search");
      searchTrigger.setAttribute("aria-label", "Search");
    }

    var params = new URLSearchParams(window.location.search);
    var sharedQuery = params.get("q") || params.get("query");
    if (sharedQuery) searchQueryMemory.save(sharedQuery);

    var syncQueryState = function () {
      var hasQuery = Boolean(input.value.trim());
      search.classList.toggle("edwinos-search-has-query", hasQuery);
      output.hidden = !hasQuery;
    };

    var emitQuery = function () {
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    };

    var queryTimer = 0, composing = false, inputPaintFrame = 0;
    var pendingMemoryReset = false, searchWasOpen = searchToggle.checked;
    var scheduleQueryEmit = function () {
      window.clearTimeout(queryTimer);
      if (composing) return;
      queryTimer = window.setTimeout(emitQuery, 100);
    };

    var openSearch = function () {
      if (!searchToggle.checked) {
        runtime.allowOpen();
        beginHeaderSearchTransition();
        searchToggle.checked = true;
        searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }

    };

    runtime.listen(runtime.header, "click", function (event) {
      var target = event.target && event.target.nodeType === 1
        ? event.target
        : event.target && event.target.parentElement;
      var control = target && target.closest ? target.closest('[for="__search"]') : null;
      if (!control || control.classList.contains("md-search__overlay")) return;

      // Material focuses the input on label click. Its focus handler opens the
      // checkbox before the label's default action can toggle it closed again.
      // Own this activation once, for both the outer trigger and form icon.
      event.preventDefault();
      event.stopPropagation();
      runtime.allowOpen();
      openSearch();
      // Keep this user gesture's synchronous focus for iOS software keyboards.
      if (searchToggle.checked && input.isConnected) input.focus({ preventScroll: true });
      runtime.focusInput(scheduleQueryEmit);
    }, true);

    if (form.dataset.edwinosSearchFormReady !== "1") {
      form.dataset.edwinosSearchFormReady = "1";
      runtime.listen(form, "click", function (event) {
        if (searchToggle.checked) return;

        var target = event.target && event.target.nodeType === 1
          ? event.target
          : event.target && event.target.parentElement;
        if (target && target.closest && target.closest(".md-search__options")) return;

        event.preventDefault();
        openSearch();
        runtime.focusInput();
      });
    }

    var updateSharedQuery = function () {
      var query = input.value.trim();
      var url = new URL(window.location.href);

      if (query) {
        url.searchParams.set("q", query);
      } else {
        url.searchParams.delete("q");
      }
      url.searchParams.delete("query");

      window.history.replaceState(null, "", url);
    };

    runtime.listen(input, "focus", function () {
      // Arm now, before Material's delayed checkbox change or the label's
      // default action. The deferred activation is cancelable on close/Esc.
      if (!searchToggle.checked) beginHeaderSearchTransition();
      runtime.deferActivation(function () {
        if (document.activeElement === input) openSearch();
      });
    });
    runtime.listen(input, "click", openSearch);
    runtime.listen(input, "compositionstart", function () {
      composing = true;
      window.clearTimeout(queryTimer);
    });
    runtime.listen(input, "compositionend", function () {
      composing = false;
      if (pendingMemoryReset) { clearQueryAfterSharedReset(); return; }
      searchQueryMemory.save(input.value);
      syncQueryState();
      scheduleQueryEmit();
    });
    runtime.listen(input, "keyup", function (event) {
      if (!event.isTrusted) return;
      // Material reads every keyup. Keep IME preedit and rapid keypresses out
      // of retrieval; one synthetic keyup submits the settled input value.
      event.stopImmediatePropagation();
      if (!event.isComposing && !composing) scheduleQueryEmit();
    }, true);
    runtime.listen(input, "input", function (event) {
      var inputStarted = window.performance.now();
      if (!event.isComposing && !composing) searchQueryMemory.save(input.value);
      syncQueryState();
      openSearch();
      if (!input.value.trim()) runtime.updateResults();
      if (!event.isComposing && !composing) scheduleQueryEmit();
      window.cancelAnimationFrame(inputPaintFrame);
      inputPaintFrame = window.requestAnimationFrame(function () {
        if (!search.isConnected) return;
        var elapsed = window.performance.now() - inputStarted;
        search.dataset.edwinosSearchInputFrameMs = String(Math.round(elapsed * 100) / 100);
      });
    });
    runtime.listen(input, "keydown", function (event) {
      if (event.isComposing || composing || event.keyCode === 229) {
        event.stopImmediatePropagation();
        return;
      }
      if (event.key === "Escape") {
        runtime.cancelFocus();
        beginHeaderSearchTransition();
        searchToggle.checked = false;
        searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
        return;
      }

      if (event.key !== "Enter") return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }

      openSearch();
      updateSharedQuery();
      scheduleQueryEmit();
    }, true);

    runtime.listen(form, "submit", function (event) {
      event.preventDefault();
      openSearch();
      updateSharedQuery();
      scheduleQueryEmit();
      input.focus({ preventScroll: true });
    }, true);

    runtime.listen(form, "reset", function () {
      runtime.timer(function () {
        if (!composing) searchQueryMemory.save(input.value);
        syncQueryState();
        runtime.updateResults();
      }, 0);
    });

    function clearQueryAfterSharedReset() {
      pendingMemoryReset = false;
      window.clearTimeout(queryTimer);
      input.value = "";
      syncQueryState();
      runtime.updateResults();
      emitQuery();
    }
    searchQueryMemory.onReset(function () {
      if (!search.isConnected) return;
      if (composing) pendingMemoryReset = true;
      else clearQueryAfterSharedReset();
    });

    runtime.listen(searchToggle, "change", function () {
      if (!searchToggle.checked) {
        searchWasOpen = false;
        window.clearTimeout(queryTimer);
        runtime.cancelFocus();
        input.blur();
        input.value = "";
        syncQueryState();
        runtime.updateResults();
        // A reset/input event would refocus or reopen Material's search.
        emitQuery();
        var url = new URL(window.location.href);
        if (url.searchParams.has("q") || url.searchParams.has("query")) {
          url.searchParams.delete("q");
          url.searchParams.delete("query");
          window.history.replaceState(window.history.state, "", url);
        }
        return;
      }

      if (!searchWasOpen && !input.value) input.value = searchQueryMemory.read();
      searchWasOpen = true;
      syncQueryState();
      runtime.focusInput(scheduleQueryEmit);
    });

    runtime.listen(window, 'click', function (event) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      var target = event.target && event.target.closest ? event.target : event.target && event.target.parentElement;
      var link = target && target.closest ? target.closest('.md-search-result__link[href]') : null;
      if (!link || !searchToggle.checked || link.hasAttribute('download')) return;
      if (link.target && link.target !== '_self') return;
      var destination;
      try { destination = new URL(link.href, window.location.href); }
      catch (_error) { return; }
      if (!/^https?:$/.test(destination.protocol) || destination.origin !== window.location.origin) return;
      var current = new URL(window.location.href);
      var pagePath = function (url) { return url.pathname.replace(/\/index\.html$/i, '/').replace(/\/+$/, ''); };
      var loadDocument = pagePath(destination) !== pagePath(current) || !destination.hash ||
        destination.searchParams.get('h') !== current.searchParams.get('h');
      if (loadDocument) {
        // Material publishes the new URL before replacing the content. Its
        // h highlighter then marks the outgoing page, and an unbounded XHR can
        // leave that page behind the destination URL. Native document loading
        // commits URL/content together and provides browser error recovery.
        // Capture href before clearing the query can remove the result node.
        event.preventDefault();
        event.stopImmediatePropagation();
      }
      // Run before block-links' document capture handler consumes same-page
      // fragments. A fragment with unchanged highlight terms keeps that owner.
      searchToggle.checked = false;
      searchToggle.dispatchEvent(new Event('change', { bubbles: true }));
      if (loadDocument) window.location.assign(destination.href);
    }, true);

    if (sharedQuery && !input.value) {
      input.value = sharedQuery;
    }
    if (input.value) searchQueryMemory.save(input.value);
    syncQueryState();

    // Keep a query typed into the static input before Material finished loading.
    if (sharedQuery || input.value.trim()) {
      runtime.deferActivation(function () {
        openSearch();
        scheduleQueryEmit();
      });
    }
  }

  function normalizePaletteButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.md-header__option[data-md-component="palette"]'), function (palette) {
      var inputs = Array.prototype.slice.call(palette.querySelectorAll(".md-option"));
      var labels = Array.prototype.slice.call(palette.querySelectorAll(".md-header__button"));
      if (!inputs.length || !labels.length) return;

      if (palette.dataset.edwinosPaletteReady !== "1") {
        palette.dataset.edwinosPaletteReady = "1";
        inputs.forEach(function (input) {
          input.addEventListener("change", normalizePaletteButtons);
        });
      }

      var checked = inputs.find(function (input) {
        return input.checked;
      });
      var labelToShow = checked && checked.nextElementSibling && checked.nextElementSibling.classList.contains("md-header__button")
        ? checked.nextElementSibling
        : labels.find(function (label) {
          return !label.hidden;
        }) || labels[0];

      labels.forEach(function (label) {
        label.hidden = label !== labelToShow;
      });
    });
  }

  function siteHref(relativePath) {
    var logo = document.querySelector(".md-header__button.md-logo");
    var logoHref = logo ? (logo.getAttribute("href") || "").trim() : "";
    var homeUrl = new URL(logoHref || "/", window.location.href);
    return new URL(relativePath, homeUrl).pathname;
  }

  var sourceFactsObserver = null;
  var sourceFactsObserverTarget = null;
  var sourceFactsRequestStarted = false;
  var latestSourceFacts = null;
  var sourceFactsStorageKey = "edwinos-github-repo-facts-v1";

  function sourceFactMarkup() {
    return [
      '<ul class="md-source__facts" data-edwinos-source-facts="true">',
      '  <li class="md-source__fact md-source__fact--stars" data-source-fact="stars">&mdash;</li>',
      '  <li class="md-source__fact md-source__fact--forks" data-source-fact="forks">&mdash;</li>',
      '</ul>'
    ].join("");
  }

  function formatSourceFactCount(value) {
    var count = Number(value);
    if (!Number.isFinite(count) || count < 0) return "—";
    if (count < 1000) return String(count);
    if (count < 1000000) return (count / 1000).toFixed(count < 10000 ? 1 : 0).replace(/\.0$/, "") + "k";
    return (count / 1000000).toFixed(count < 10000000 ? 1 : 0).replace(/\.0$/, "") + "m";
  }

  function applySourceFacts() {
    if (!latestSourceFacts) return;

    Array.prototype.forEach.call(document.querySelectorAll('.md-source__fact[data-source-fact="stars"]'), function (fact) {
      var text = formatSourceFactCount(latestSourceFacts.stars);
      if (fact.textContent !== text) fact.textContent = text;
    });
    Array.prototype.forEach.call(document.querySelectorAll('.md-source__fact[data-source-fact="forks"]'), function (fact) {
      var text = formatSourceFactCount(latestSourceFacts.forks);
      if (fact.textContent !== text) fact.textContent = text;
    });
  }

  function sourceRepositoryName() {
    var source = document.querySelector(".md-header__source .md-source");
    var href = source ? source.getAttribute("href") : "";
    if (!href) return "";

    try {
      var url = new URL(href, window.location.href);
      if (url.hostname !== "github.com") return "";
      var parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      return parts.length >= 2 ? parts[0] + "/" + parts[1] : "";
    } catch (error) {
      return "";
    }
  }

  function normalizeSourceFactPayload(data) {
    if (!data || typeof data !== "object") return null;
    if (!sourceRepositoryName() || data.repository !== sourceRepositoryName()) return null;
    if (!Number.isInteger(data.stars) || data.stars < 0) return null;
    if (!Number.isInteger(data.forks) || data.forks < 0) return null;
    var observedAt = Date.parse(data.observed_at || data.generated_at || "");
    return {
      repository: data.repository,
      stars: data.stars,
      forks: data.forks,
      observedAt: Number.isFinite(observedAt) ? observedAt : 0
    };
  }

  function restoreStoredSourceFacts() {
    try {
      var cached = normalizeSourceFactPayload(JSON.parse(window.localStorage.getItem(sourceFactsStorageKey) || "null"));
      if (cached) latestSourceFacts = cached;
    } catch (error) {
      // Storage can be unavailable in privacy-restricted contexts.
    }
  }

  function storeSourceFacts(facts) {
    try {
      window.localStorage.setItem(sourceFactsStorageKey, JSON.stringify({
        repository: facts.repository,
        stars: facts.stars,
        forks: facts.forks,
        observed_at: facts.observedAt > 0 ? new Date(facts.observedAt).toISOString() : ""
      }));
    } catch (error) {
      // The same-origin build artifact remains the primary source of truth.
    }
  }

  function acceptSourceFacts(facts) {
    if (!facts) return false;
    if (latestSourceFacts && facts.observedAt < latestSourceFacts.observedAt) return false;
    latestSourceFacts = facts;
    storeSourceFacts(facts);
    applySourceFacts();
    return true;
  }

  function sourceRepositoryApiUrl() {
    var repository = sourceRepositoryName();
    if (!repository) return "";
    var parts = repository.split("/");
    if (parts.length !== 2) return "";
    return "https://api.github.com/repos/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]);
  }

  function refreshSourceFactsFromGitHub() {
    var apiUrl = sourceRepositoryApiUrl();
    if (!apiUrl) return Promise.resolve();

    return fetch(apiUrl, {
      cache: "no-cache",
      headers: { "Accept": "application/vnd.github+json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("GitHub repository facts unavailable");
        return response.json();
      })
      .then(function (data) {
        var facts = normalizeSourceFactPayload({
          repository: data.full_name,
          stars: data.stargazers_count,
          forks: data.forks_count,
          observed_at: new Date().toISOString()
        });
        if (!facts) throw new Error("Invalid GitHub repository facts");
        acceptSourceFacts(facts);
      })
      .catch(function () {
        // Keep the same-origin snapshot or the last successful cached value.
        applySourceFacts();
      });
  }

  function updateSourceFacts() {
    normalizeSourceFacts();
    if (!latestSourceFacts) restoreStoredSourceFacts();
    applySourceFacts();

    if (sourceFactsRequestStarted) return;
    sourceFactsRequestStarted = true;

    fetch(siteHref("assets/data/github-repo.json"), {
      cache: "no-cache",
      headers: { "Accept": "application/json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("Repository facts unavailable");
        return response.json();
      })
      .then(function (data) {
        var facts = normalizeSourceFactPayload(data);
        if (!facts) throw new Error("Invalid repository facts");
        acceptSourceFacts(facts);
      })
      .catch(function () {
        applySourceFacts();
      })
      .then(refreshSourceFactsFromGitHub);
  }

  function normalizeSourceFacts() {
    var sources = document.querySelectorAll(".md-header__source .md-source, .md-nav__source .md-source");
    sources.forEach(function (source) {
      var repo = source.querySelector(".md-source__repository");
      if (!repo) return;

      var facts = Array.prototype.filter.call(repo.children, function (child) {
        return child.classList && child.classList.contains("md-source__facts");
      });
      var realFacts = facts.filter(function (factList) {
        return !factList.hasAttribute("data-edwinos-source-facts");
      });

      if (realFacts.length) {
        facts.forEach(function (factList) {
          if (factList.hasAttribute("data-edwinos-source-facts")) {
            factList.remove();
          }
        });
        facts = realFacts;
      } else if (!facts.length) {
        repo.insertAdjacentHTML("beforeend", sourceFactMarkup());
        facts = Array.prototype.filter.call(repo.children, function (child) {
          return child.classList && child.classList.contains("md-source__facts");
        });
      }

      if (facts.length > 1) {
        facts.slice(0, -1).forEach(function (factList) {
          factList.remove();
        });
        facts = facts.slice(-1);
      }

      repo.classList.add("md-source__repository--active");
      facts.forEach(function (factList) {
        Array.prototype.forEach.call(factList.querySelectorAll(".md-source__fact"), function (fact, index) {
          var factType = index === 0 ? "stars" : "forks";
          fact.setAttribute("data-source-fact", factType);
          fact.classList.toggle("md-source__fact--stars", factType === "stars");
          fact.classList.toggle("md-source__fact--forks", factType === "forks");
        });
      });
    });
    applySourceFacts();
  }

  function watchSourceFacts() {
    var body = document.body;

    if (
      sourceFactsObserver &&
      (
        !sourceFactsObserverTarget ||
        sourceFactsObserverTarget !== body ||
        !sourceFactsObserverTarget.isConnected
      )
    ) {
      sourceFactsObserver.disconnect();
      sourceFactsObserver = null;
      sourceFactsObserverTarget = null;
    }

    var canObserveBody = body &&
      typeof window.Node === "function" &&
      body instanceof window.Node &&
      body.nodeType === window.Node.ELEMENT_NODE &&
      body.isConnected;

    if (!canObserveBody || typeof window.MutationObserver !== "function") return;
    if (sourceFactsObserver && sourceFactsObserverTarget === body) return;

    var observer = new window.MutationObserver(function (mutations) {
      if (
        !sourceFactsObserverTarget ||
        sourceFactsObserverTarget !== document.body ||
        !sourceFactsObserverTarget.isConnected
      ) {
        watchSourceFacts();
        return;
      }

      var sourceChanged = mutations.some(function (mutation) {
        var target = mutation.target;
        if (
          target &&
          target.nodeType === window.Node.ELEMENT_NODE &&
          target.closest(".md-header__source, .md-nav__source")
        ) {
          return true;
        }

        return Array.prototype.some.call(mutation.addedNodes, function (node) {
          return node.nodeType === window.Node.ELEMENT_NODE &&
            (
              node.matches(".md-header__source, .md-nav__source") ||
              node.querySelector(".md-header__source, .md-nav__source")
            );
        });
      });

      if (!sourceChanged) return;
      normalizeSourceFacts();
    });

    try {
      observer.observe(body, {
        childList: true,
        subtree: true
      });
      sourceFactsObserver = observer;
      sourceFactsObserverTarget = body;
    } catch (error) {
      observer.disconnect();
      sourceFactsObserver = null;
      sourceFactsObserverTarget = null;
    }
  }

  function profileSidebarHtml() {
    return [
      '<div class="profile-card">',
      '  <div class="profile-avatar">',
      '    <img src="' + siteHref("assets/images/avatar-edwin-notionists.svg") + '" alt="Chen Jing (经宸)" loading="eager" fetchpriority="high" decoding="async">',
      '  </div>',
      '  <div class="profile-details">',
      '  <div class="profile-name-wrap">',
      '    <h1 class="profile-name">Chen Jing <span class="profile-cn-name">(经宸)</span></h1>',
      '    <p class="profile-pronouns">Edwin &middot; he/him</p>',
      '    <p class="profile-role">Undergraduate Student</p>',
      '  </div>',
      '  <div class="profile-actions">',
      '    <a href="' + siteHref("HOME/Archive/") + '" class="btn-github-action">Archive of Updates</a>',
      '  </div>',
      '  <div class="profile-followers">',
      '    <a href="' + siteHref("HOME/friends/") + '" class="follower-link">',
      '      <svg class="meta-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 5.5a3.5 3.5 0 1 1 5.898 2.549 5.508 5.508 0 0 1 3.034 4.084.75.75 0 1 1-1.482.235 4 4 0 0 0-7.9 0 .75.75 0 0 1-1.482-.236A5.507 5.507 0 0 1 3.102 8.05 3.493 3.493 0 0 1 2 5.5ZM11 4a3.001 3.001 0 0 1 2.22 5.018 5.01 5.01 0 0 1 2.56 3.012.749.749 0 0 1-.885.954.752.752 0 0 1-.549-.514 3.507 3.507 0 0 0-2.522-2.372.75.75 0 0 1-.574-.73v-.352a.75.75 0 0 1 .416-.68 1.5 1.5 0 0 0-.14-2.828.75.75 0 0 1-.714-.807l.006-.051A1.5 1.5 0 0 0 11 4Z"></path></svg>',
      '      <span class="follower-text"><span class="follower-count" id="friend-count">2</span> followers <span class="follower-separator">&middot;</span> followings</span>',
      '    </a>',
      '  </div>',
      '  <ul class="profile-meta">',
      '    <li>',
      '      <svg class="meta-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.75 16A1.75 1.75 0 0 1 0 14.25V1.75C0 .784.784 0 1.75 0h8.5C11.216 0 12 .784 12 1.75v12.5c0 .085-.006.168-.018.25h2.268a.25.25 0 0 0 .25-.25V8.285a.25.25 0 0 0-.111-.208l-1.055-.703a.749.749 0 1 1 .832-1.248l1.055.703c.487.325.779.871.779 1.456v5.965A1.75 1.75 0 0 1 14.25 16ZM5.75 14.5h1.5v-2.75A.75.75 0 0 1 8 11h1.5a.75.75 0 0 1 .75.75v2.75h1.5a.25.25 0 0 0 .25-.25V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25Zm-.75-11a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 5 3.5Zm0 3a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 5 6.5Zm3-3a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 8 3.5Zm0 3a.75.75 0 0 1 .75-.75h.5a.75.75 0 0 1 0 1.5h-.5A.75.75 0 0 1 8 6.5Z"></path></svg>',
      '      <a href="https://www.zju.edu.cn/" target="_blank" rel="noopener" class="meta-link">Zhejiang University</a>',
      '    </li>',
      '    <li>',
      '      <svg class="meta-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Zm7-3.25v2.992l2.028.812a.75.75 0 0 1-.557 1.392l-2.5-1A.751.751 0 0 1 7 8.25v-3.5a.75.75 0 0 1 1.5 0Z"></path></svg>',
      '      <span class="meta-text" id="beijing-time">Loading...</span>',
      '    </li>',
      '    <li>',
      '      <svg class="meta-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M1.75 2h12.5c.966 0 1.75.784 1.75 1.75v8.5A1.75 1.75 0 0 1 14.25 14H1.75A1.75 1.75 0 0 1 0 12.25v-8.5C0 2.784.784 2 1.75 2ZM1.5 12.251c0 .138.112.25.25.25h12.5a.25.25 0 0 0 .25-.25V5.809L8.38 9.397a.75.75 0 0 1-.76 0L1.5 5.809v6.442Zm13-8.181v-.32a.25.25 0 0 0-.25-.25H1.75a.25.25 0 0 0-.25.25v.32L8 7.88Z"></path></svg>',
      '      <a href="mailto:edwinjing2026@outlook.com" class="meta-link">edwinjing2026@outlook.com</a>',
      '    </li>',
      '  </ul>',
      '  <div class="profile-social-left" aria-label="Profile links">',
      '    <a href="https://github.com/SPIRAL-EDWIN" target="_blank" rel="noopener" title="GitHub" aria-label="GitHub"><svg class="social-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82A7.59 7.59 0 0 1 8 3.86c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"></path></svg></a>',
      '    <a href="https://www.linkedin.com/in/chen-jing-31a16a421/" target="_blank" rel="noopener" title="LinkedIn" aria-label="LinkedIn"><svg class="social-icon" aria-hidden="true" viewBox="0 0 448 512"><path d="M100.3 448H7.4V148.9h92.9V448ZM53.8 108.1C24.1 108.1 0 83.5 0 53.8A53.8 53.8 0 0 1 107.6 53.8c0 29.7-24.1 54.3-53.8 54.3ZM447.9 448h-92.7V302.4c0-34.7-.7-79.2-48.3-79.2-48.3 0-55.7 37.7-55.7 76.7V448h-92.8V148.9h89.1v40.8h1.3c12.4-23.5 42.7-48.3 87.9-48.3 94 0 111.3 61.9 111.3 142.3V448Z"></path></svg></a>',
      '    <a href="https://scholar.google.com/citations?user=vgoqJdAAAAAJ&amp;hl=zh-CN" target="_blank" rel="noopener" title="Google Scholar" aria-label="Google Scholar"><span class="social-icon social-icon--scholar" aria-hidden="true"></span></a>',
      '    <a href="https://www.youtube.com/@EdwinJing" target="_blank" rel="noopener" title="YouTube" aria-label="YouTube"><svg class="social-icon" aria-hidden="true" viewBox="0 0 576 512"><path d="M549.7 124.1c-6.2-23.7-24.8-42.3-48.3-48.6C458.9 64 288.1 64 288.1 64S117.3 64 74.7 75.5c-23.5 6.3-42 24.9-48.3 48.6C15 167 15 256.4 15 256.4s0 89.4 11.4 132.3c6.3 23.6 24.8 41.5 48.3 47.8C117.3 448 288.1 448 288.1 448s170.8 0 213.4-11.5c23.5-6.3 42-24.2 48.3-47.8 11.4-42.9 11.4-132.3 11.4-132.3s0-89.4-11.4-132.3zM232.2 337.6V175.2l142.7 81.2z"></path></svg></a>',
      '    <a href="https://x.com/EdwinJing661" target="_blank" rel="noopener" title="Twitter/X" aria-label="Twitter/X"><svg class="social-icon" aria-hidden="true" viewBox="0 0 448 512"><path d="M357.2 48h70.6L273.6 224.2 455 464H313L201.7 318.6 74.5 464H3.8l164.9-188.5L-5.2 48h145.6l100.5 132.9zm-24.8 373.8h39.1L119.1 88h-42z"></path></svg></a>',
      '  </div>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function updateBeijingTime() {
    var timeElements = document.querySelectorAll("#beijing-time");
    if (!timeElements.length) return;

    var now = new Date();
    var utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    var beijing = new Date(utc + (3600000 * 8));
    var hours = String(beijing.getHours()).padStart(2, "0");
    var minutes = String(beijing.getMinutes()).padStart(2, "0");
    var markup = '<span class="beijing-time-main">' + hours + ":" + minutes + '</span> <span class="beijing-time-zone">(UTC +08:00)</span>';

    timeElements.forEach(function (timeElement) {
      if (timeElement.innerHTML !== markup) {
        timeElement.innerHTML = markup;
      }
    });
  }

  function updateFriendCount() {
    var countElements = document.querySelectorAll("#friend-count");
    if (!countElements.length) return;

    if (friendCountValue !== null) {
      countElements.forEach(function (countElement) {
        countElement.textContent = String(friendCountValue);
      });
      return;
    }
    if (friendCountRequest) return;

    function countRealFriends(markup) {
      var friendDoc = new DOMParser().parseFromString(markup, "text/html");
      return Array.prototype.filter.call(friendDoc.querySelectorAll(".friend-card[href]"), function (link) {
        var href = link.getAttribute("href") || "";
        return !/^https?:\/\/example\d*\.com\/?/i.test(href);
      }).length;
    }

    // Fetch once per full page load. Material may call runAll more than once
    // for the same document; a browser refresh creates a fresh request.
    friendCountRequest = fetch(siteHref("HOME/friends/"), { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to fetch friend page");
        return response.text();
      })
      .then(function (markup) {
        var friendCount = countRealFriends(markup);
        if (friendCount < 1) return;
        friendCountValue = friendCount;
        document.querySelectorAll("#friend-count").forEach(function (countElement) {
          countElement.textContent = String(friendCount);
        });
      })
      .catch(function () {
        // Keep the inline fallback when the page is not available.
      });
  }

  function isVisitorBadgeImage(image, link) {
    if (!image || !link) return false;

    try {
      var imageUrl = new URL(image.getAttribute("src") || image.currentSrc, window.location.href);
      var linkUrl = new URL(link.getAttribute("href"), window.location.href);
      return imageUrl.hostname === "api.visitorbadge.io" &&
        /^\/api\/(?:visitors|daily|combined)\/?$/i.test(imageUrl.pathname) &&
        linkUrl.hostname === "visitorbadge.io" &&
        /^\/status\/?$/i.test(linkUrl.pathname);
    } catch (error) {
      return false;
    }
  }

  function visitorBadgeFallback() {
    var fallback = document.createElement("span");
    fallback.className = "visitor-badge-fallback";
    fallback.setAttribute("role", "status");
    fallback.setAttribute("aria-live", "polite");
    fallback.textContent = "Visitor statistics are temporarily unavailable.";
    return fallback;
  }

  var visitorDeploymentRequestStarted = false;
  var latestVisitorDeployment = null;

  function visitorDeploymentApiUrl(container) {
    var repository = (container.getAttribute("data-deployment-repository") || "").trim();
    var workflow = (container.getAttribute("data-deployment-workflow") || "").trim();

    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !/^[A-Za-z0-9_.-]+\.ya?ml$/.test(workflow)) {
      return "";
    }

    return "https://api.github.com/repos/" + repository + "/actions/workflows/" + workflow +
      "/runs?event=push&status=completed&per_page=20";
  }

  function formatVisitorDeploymentMonth(value) {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    var formatted = new Intl.DateTimeFormat("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "Asia/Shanghai"
    }).format(date);

    return formatted.replace(/^([A-Za-z]{3})\s+/, "$1. ");
  }

  function applyVisitorDeploymentTime() {
    if (!latestVisitorDeployment) return;

    Array.prototype.forEach.call(document.querySelectorAll("[data-visitor-deployment]"), function (container) {
      var time = container.querySelector("[data-visitor-deployment-time]");
      if (!time) return;
      time.dateTime = latestVisitorDeployment.updatedAt;
      time.textContent = latestVisitorDeployment.text;
      time.title = latestVisitorDeployment.title;
    });
  }

  function updateVisitorDeploymentTime() {
    var container = document.querySelector("[data-visitor-deployment]");
    if (!container) return;

    applyVisitorDeploymentTime();
    if (latestVisitorDeployment || visitorDeploymentRequestStarted) return;

    var apiUrl = visitorDeploymentApiUrl(container);
    if (!apiUrl) return;
    visitorDeploymentRequestStarted = true;

    fetch(apiUrl, {
      cache: "no-cache",
      headers: { "Accept": "application/vnd.github+json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("GitHub deployment data unavailable");
        return response.json();
      })
      .then(function (data) {
        var latestSuccessfulRun = (data.workflow_runs || []).find(function (run) {
          return run && run.conclusion === "success" && run.updated_at;
        });
        if (!latestSuccessfulRun) return;

        var displayMonth = formatVisitorDeploymentMonth(latestSuccessfulRun.updated_at);
        if (!displayMonth) return;

        latestVisitorDeployment = {
          updatedAt: latestSuccessfulRun.updated_at,
          text: "Latest updated " + displayMonth,
          title: "Last successful GitHub Pages deployment: " + new Date(latestSuccessfulRun.updated_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Shanghai"
          }) + " (UTC+8)"
        };
        applyVisitorDeploymentTime();
      })
      .catch(function () {
        // Leave the static fallback in place; a later homepage visit can retry.
      })
      .then(function () {
        visitorDeploymentRequestStarted = false;
      });
  }

  function setupVisitorBadge() {
    var containers = document.querySelectorAll(
      ".academic-home-layout .academic-content .visitor-container"
    );

    containers.forEach(function (container) {
      var image = container.querySelector("a[href] img[src]");
      var link = image ? image.closest("a[href]") : null;
      if (!isVisitorBadgeImage(image, link)) return;

      container.classList.add("visitor-badge-panel");
      link.classList.add("visitor-badge-link");
      image.classList.add("visitor-badge-image");

      var visitorBadgeLinkLabel = "View visitor statistics (opens in a new tab)";
      var visitorBadgeFailureLabel = "Visitor count is temporarily unavailable. View service status (opens in a new tab)";

      link.setAttribute("target", "_blank");
      link.setAttribute(
        "aria-label",
        image.dataset.visitorBadgeState === "failed" ? visitorBadgeFailureLabel : visitorBadgeLinkLabel
      );

      var rel = (link.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
      ["noopener", "noreferrer"].forEach(function (value) {
        if (rel.indexOf(value) === -1) rel.push(value);
      });
      link.setAttribute("rel", rel.join(" "));

      image.setAttribute("decoding", "async");
      image.setAttribute("fetchpriority", "low");
      if (!image.getAttribute("alt")) image.setAttribute("alt", "Visitors");

      if (image.dataset.visitorBadgeReady === "1") return;
      image.dataset.visitorBadgeReady = "1";

      var markLoaded = function () {
        image.dataset.visitorBadgeState = "loaded";
        image.hidden = false;
        link.setAttribute("aria-label", visitorBadgeLinkLabel);
        container.classList.remove("visitor-badge-panel--failed");
        var fallback = link.querySelector(".visitor-badge-fallback");
        if (fallback) fallback.remove();
      };

      var markFailed = function () {
        if (image.dataset.visitorBadgeState === "failed") return;
        image.dataset.visitorBadgeState = "failed";
        image.hidden = true;
        link.setAttribute("aria-label", visitorBadgeFailureLabel);
        container.classList.add("visitor-badge-panel--failed");
        if (!link.querySelector(".visitor-badge-fallback")) {
          link.appendChild(visitorBadgeFallback());
        }
      };

      image.addEventListener("load", markLoaded);
      image.addEventListener("error", markFailed);

      if (image.complete) {
        if (image.naturalWidth > 0 && image.naturalHeight > 0) {
          markLoaded();
        } else {
          markFailed();
        }
      }
    });
  }

  function ensureHomeProfileLayout() {
    var route = classifyUiRoute(window.location.pathname, "");
    if (!route.isHomeProfilePage) return;

    var contentInner = document.querySelector(".md-content__inner");
    if (!contentInner) return;

    if (contentInner.querySelector(".academic-home-layout--subpage")) {
      updateBeijingTime();
      return;
    }

    var layout = document.createElement("div");
    layout.className = "academic-home-layout academic-home-layout--subpage";

    var sidebar = document.createElement("aside");
    sidebar.className = "academic-sidebar";
    sidebar.innerHTML = profileSidebarHtml();

    var main = document.createElement("main");
    main.className = "academic-content academic-content--subpage";

    while (contentInner.firstChild) {
      main.appendChild(contentInner.firstChild);
    }

    layout.appendChild(sidebar);
    layout.appendChild(main);
    contentInner.appendChild(layout);

    updateBeijingTime();
  }

  function markProfileDrawerEntries() {
    var primaryNav = document.querySelector(".md-sidebar--primary .md-nav--primary");
    if (!primaryNav) return;

    var profilePaths = {
      "/HOME/Archive/": true,
      "/HOME/friends/": true
    };

    Array.prototype.forEach.call(primaryNav.querySelectorAll("a.md-nav__link[href]"), function (link) {
      var normalizedPath = "";

      try {
        normalizedPath = new URL(link.getAttribute("href"), window.location.href).pathname;
      } catch (error) {
        return;
      }

      normalizedPath = normalizedPath.replace(/\/index\.html$/i, "/");
      if (!profilePaths[normalizedPath]) return;

      var item = link.closest(".md-nav__item");
      if (item) item.classList.add("edwinos-profile-drawer-entry");
    });
  }

  function normalizedDrawerPath(value) {
    var pathname = value || "";

    try {
      pathname = new URL(value, window.location.href).pathname;
    } catch (error) {
      // A pathname passed directly is already sufficient.
    }

    try {
      pathname = decodeURIComponent(pathname);
    } catch (error) {
      // Preserve malformed encoded paths so route detection fails safely.
    }

    return pathname.replace(/\/index\.html$/i, "/");
  }

  function currentDrawerSection() {
    var pathname = normalizedDrawerPath(window.location.pathname || "");

    if (/^\/OsdNotes(?:\/|$)/i.test(pathname)) {
      return {
        key: "enotes",
        label: "ENotes",
        rootPath: "/OsdNotes/"
      };
    }

    if (/^\/经验分享(?:\/|$)/.test(pathname)) {
      return {
        key: "experiences",
        label: "More Experiences",
        rootPath: "/经验分享/"
      };
    }

    return null;
  }

  function setSectionNavigationDepth(restoreMobileNativeDepth) {
    var section = currentDrawerSection();
    if (!section) return;

    var primaryNav = document.querySelector(".md-sidebar--primary .md-nav--primary");
    if (!primaryNav) return;

    var sectionRootLink = Array.prototype.find.call(
      primaryNav.querySelectorAll("a.md-nav__link[href]"),
      function (link) {
        return normalizedDrawerPath(link.getAttribute("href")) === section.rootPath;
      }
    );
    if (!sectionRootLink) return;

    var sectionRootItem = sectionRootLink.closest(".md-nav__item");
    var sectionRootToggle = sectionRootItem && Array.prototype.find.call(sectionRootItem.children, function (child) {
      return child.matches && child.matches("input.md-nav__toggle");
    });
    var sectionNav = sectionRootItem && Array.prototype.find.call(sectionRootItem.children, function (child) {
      return child.classList && child.classList.contains("md-nav");
    });
    if (!sectionRootItem || !sectionRootToggle || !sectionNav) return;

    primaryNav.setAttribute("data-edwinos-drawer-section", section.key);
    sectionRootItem.classList.add("edwinos-drawer-section-root");
    sectionNav.classList.add("edwinos-drawer-section-nav");

    var sectionTitle = Array.prototype.find.call(sectionNav.children, function (child) {
      return child.classList && child.classList.contains("md-nav__title");
    });
    if (sectionTitle) {
      sectionTitle.classList.add("edwinos-drawer-section-title");
      sectionTitle.classList.remove("edwinos-drawer-back-title");
      sectionTitle.setAttribute("aria-label", section.label);
      sectionTitle.removeAttribute("role");
      sectionTitle.removeAttribute("tabindex");

      if (!sectionTitle.dataset.edwinosNativeFor) {
        sectionTitle.dataset.edwinosNativeFor = sectionTitle.getAttribute("for") || "";
      }

      if (primarySidebarIsDesktop()) {
        if (sectionTitle.dataset.edwinosNativeFor) {
          sectionTitle.setAttribute("for", sectionTitle.dataset.edwinosNativeFor);
        }
      } else {
        sectionTitle.removeAttribute("for");
      }
    }

    Array.prototype.forEach.call(
      sectionNav.querySelectorAll(
        'nav.md-nav:not(.md-nav--secondary) > label.md-nav__title[for^="__nav_"]'
      ),
      function (title) {
        if (title === sectionTitle) return;

        if (!title.dataset.edwinosDrawerBackFor) {
          title.dataset.edwinosDrawerBackFor = title.getAttribute("for") || "";
        }

        title.classList.add("edwinos-drawer-back-title");
        title.setAttribute("aria-label", "返回上一级导航");
        title.removeAttribute("for");
        title.removeAttribute("title");
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");

        if (title.dataset.edwinosDrawerBackReady !== "1") {
          title.dataset.edwinosDrawerBackReady = "1";

          var returnToParentNavigation = function (event) {
            if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;

            var toggle = document.getElementById(title.dataset.edwinosDrawerBackFor || "");
            if (!toggle) return;

            event.preventDefault();
            event.stopPropagation();
            toggle.checked = false;
            toggle.dispatchEvent(new Event("change", { bubbles: true }));
          };

          title.addEventListener("click", returnToParentNavigation);
          title.addEventListener("keydown", returnToParentNavigation);
        }
      }
    );

    if (primarySidebarIsDesktop()) {
      sectionRootToggle.disabled = false;
    } else {
      sectionRootToggle.checked = true;
      sectionRootToggle.disabled = true;
      sectionNav.setAttribute("aria-expanded", "true");
    }

    var topLevelList = Array.prototype.find.call(sectionNav.children, function (child) {
      return child.classList && child.classList.contains("md-nav__list");
    });
    if (!topLevelList || section.key !== "enotes") return;

    Array.prototype.forEach.call(topLevelList.children, function (item) {
      var toggle = Array.prototype.find.call(item.children, function (child) {
        return child.matches && child.matches("input.md-nav__toggle");
      });
      if (!toggle) return;

      var nativeChecked = toggle.getAttribute("data-edwinos-native-checked");
      if (nativeChecked === null) {
        nativeChecked = toggle.checked ? "true" : "false";
        toggle.setAttribute("data-edwinos-native-checked", nativeChecked);
      }

      if (primarySidebarIsDesktop()) {
        toggle.checked = true;
      } else if (restoreMobileNativeDepth === true) {
        toggle.checked = nativeChecked === "true";
      }
    });
  }

  function setupSectionNavigationDepthSync() {
    if (typeof window.matchMedia !== "function") return;

    var media = window.matchMedia(PRIMARY_SIDEBAR_DESKTOP_QUERY);
    var syncNavigationDepth = function () {
      window.clearTimeout(sectionNavigationDepthTimer);
      sectionNavigationDepthTimer = window.setTimeout(function () {
        sectionNavigationDepthTimer = null;
        setSectionNavigationDepth(true);
      }, 180);
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", syncNavigationDepth);
    } else if (typeof media.addListener === "function") {
      media.addListener(syncNavigationDepth);
    }
  }

  function openExternalContentLinksInNewTabs() {
    Array.prototype.forEach.call(document.querySelectorAll("a[href]"), function (link) {
      var href = (link.getAttribute("href") || "").trim();
      if (!href || href.charAt(0) === "#") return;
      if (/^(mailto|tel|sms):/i.test(href)) return;

      var url;
      try {
        url = new URL(href, window.location.href);
      } catch (error) {
        return;
      }

      if (url.origin === window.location.origin) return;

      link.setAttribute("target", "_blank");
      var rel = (link.getAttribute("rel") || "").split(/\s+/).filter(Boolean);
      ["noopener", "noreferrer"].forEach(function (value) {
        if (rel.indexOf(value) === -1) rel.push(value);
      });
      link.setAttribute("rel", rel.join(" "));
    });
  }

  /**
   * Add a readable language label to fenced code blocks.
   *
   * Pymdown exposes the original fence alias as a `language-*` class on the
   * highlight wrapper. Mirroring it to a data attribute lets CSS render a
   * quiet label without changing Markdown content or the copy-button DOM.
   */
  function labelCodeBlockLanguages() {
    var LANGUAGE_LABELS = {
      bash: "Bash",
      c: "C",
      cfg: "INI",
      cpp: "C++",
      cs: "C#",
      csharp: "C#",
      css: "CSS",
      dosini: "INI",
      go: "Go",
      html: "HTML",
      ini: "INI",
      java: "Java",
      javascript: "JavaScript",
      js: "JavaScript",
      json: "JSON",
      jsx: "JSX",
      kotlin: "Kotlin",
      latex: "LaTeX",
      markdown: "Markdown",
      matlab: "MATLAB",
      md: "Markdown",
      openrc: "OpenRC",
      plaintext: "Text",
      py: "Python",
      py3: "Python",
      pyi: "Python",
      python: "Python",
      python3: "Python",
      rust: "Rust",
      scss: "SCSS",
      sh: "Shell",
      shell: "Shell",
      sql: "SQL",
      tex: "LaTeX",
      text: "Text",
      toml: "TOML",
      ts: "TypeScript",
      tsx: "TSX",
      typescript: "TypeScript",
      xml: "XML",
      yaml: "YAML",
      yml: "YAML",
      zsh: "Zsh"
    };

    function humanizeLanguage(alias) {
      if (LANGUAGE_LABELS[alias]) return LANGUAGE_LABELS[alias];
      return alias
        .split(/[-_]+/)
        .filter(Boolean)
        .map(function (word) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(" ");
    }

    document.querySelectorAll(".md-typeset .highlight").forEach(function (block) {
      var languageClass = Array.prototype.find.call(block.classList, function (className) {
        return className.indexOf("language-") === 0;
      });

      if (!languageClass) {
        block.removeAttribute("data-code-language");
        return;
      }

      var alias = languageClass.slice("language-".length).trim().toLowerCase();
      var label = humanizeLanguage(alias);
      if (label) block.setAttribute("data-code-language", label);
    });
  }

  /**
   * Give Pymdown's native <details> callouts an Obsidian-like height reveal.
   *
   * Keeping the native element preserves keyboard and no-JS behavior. We only
   * take over an activation while motion is enabled, leave `open` set until a
   * closing animation finishes, and reverse cleanly when a card is clicked
   * again mid-transition.
   */
  function setupCollapsibleCallouts() {
    var CALLOUT_TYPES = [
      "note", "abstract", "summary", "tldr", "info", "todo", "tip",
      "hint", "important", "success", "check", "done", "question",
      "help", "faq", "warning", "caution", "attention", "failure",
      "fail", "missing", "danger", "error", "bug", "example", "quote",
      "cite"
    ];
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    function isCallout(details) {
      return CALLOUT_TYPES.some(function (type) {
        return details.classList.contains(type);
      });
    }

    function directSummary(details) {
      return Array.prototype.find.call(details.children, function (child) {
        return child.tagName && child.tagName.toLowerCase() === "summary";
      });
    }

    function clearSelection() {
      var selection = window.getSelection && window.getSelection();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
    }

    function closedHeight(details, summary) {
      var style = window.getComputedStyle(details);
      return summary.getBoundingClientRect().height
        + parseFloat(style.paddingTop || "0")
        + parseFloat(style.paddingBottom || "0")
        + parseFloat(style.borderTopWidth || "0")
        + parseFloat(style.borderBottomWidth || "0");
    }

    function animate(details, summary, shouldOpen) {
      var startHeight = details.getBoundingClientRect().height;
      var previous = details.edwinosCalloutAnimation;

      if (previous) {
        previous.onfinish = null;
        previous.oncancel = null;
        previous.cancel();
      }

      details.style.height = startHeight + "px";
      details.style.overflow = "hidden";

      if (shouldOpen && !details.open) details.open = true;

      var endHeight = shouldOpen
        ? details.scrollHeight
        : closedHeight(details, summary);
      var distance = Math.abs(endHeight - startHeight);
      var duration = Math.max(180, Math.min(320, 190 + distance * 0.14));
      var state = shouldOpen ? "opening" : "closing";

      details.dataset.edwinosCalloutState = state;
      var motion = details.animate(
        [
          { height: startHeight + "px" },
          { height: endHeight + "px" }
        ],
        {
          duration: duration,
          easing: shouldOpen
            ? "cubic-bezier(0.22, 1, 0.36, 1)"
            : "cubic-bezier(0.4, 0, 0.2, 1)"
        }
      );

      details.edwinosCalloutAnimation = motion;
      motion.onfinish = function () {
        if (details.edwinosCalloutAnimation !== motion) return;
        if (!shouldOpen) details.open = false;
        details.style.removeProperty("height");
        details.style.removeProperty("overflow");
        delete details.dataset.edwinosCalloutState;
        details.edwinosCalloutAnimation = null;
      };
      motion.oncancel = function () {
        if (details.edwinosCalloutAnimation !== motion) return;
        details.style.removeProperty("height");
        details.style.removeProperty("overflow");
        delete details.dataset.edwinosCalloutState;
        details.edwinosCalloutAnimation = null;
      };
    }

    document.querySelectorAll(".md-typeset details").forEach(function (details) {
      if (details.hasAttribute("data-pdf-previews") || !isCallout(details)) return;

      var summary = directSummary(details);
      if (!summary) return;

      details.dataset.edwinosCallout = "true";
      if (details.dataset.edwinosCalloutReady === "1") return;
      details.dataset.edwinosCalloutReady = "1";

      summary.addEventListener("mousedown", function (event) {
        // Suppress the browser's second-click word selection while preserving
        // normal click-and-drag selection after the card has settled.
        if (event.button === 0 && event.detail > 1) event.preventDefault();
      });

      summary.addEventListener("dblclick", function (event) {
        event.preventDefault();
        clearSelection();
      });

      summary.addEventListener("click", function (event) {
        clearSelection();
        if (reduceMotion.matches || typeof details.animate !== "function") return;

        event.preventDefault();
        var state = details.dataset.edwinosCalloutState;
        var shouldOpen = state === "opening"
          ? false
          : state === "closing"
            ? true
            : !details.open;
        animate(details, summary, shouldOpen);
      });
    });
  }

  /**
   * Fix ordered-list numbering across callout and code-block breaks.
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
   * callout or code-block bridges, and sets start="N" on each
   * follow-up <ol> so numbering continues seamlessly.
   *
   * Bridge tags: callouts (.admonition, blockquote, details) and fenced code
   *              blocks (.highlight or a direct pre element).
   */
  function fixOrderedListContinuity() {
    var content = document.querySelector(".md-content__inner") || document.body;
    if (!content) return;

    function isBridge(el) {
      if (!el || el.nodeType !== 1) return false;
      var tag = el.tagName.toLowerCase();
      if (tag === "blockquote" || tag === "details" || tag === "pre") return true;
      if (
        el.classList &&
        (el.classList.contains("admonition") || el.classList.contains("highlight"))
      ) return true;
      return false;
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

      var prev = ol.previousElementSibling;
      // Walk back across bridges to find the most recent <ol>
      var bridgeChain = [];
      while (prev && isBridge(prev)) {
        bridgeChain.push(prev);
        prev = prev.previousElementSibling;
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
    });
  }

  // Keep author text selectable; only the trailing button controls disclosure.
  function setupAuthorToggles() {
    document.querySelectorAll(".overview-publication__authors-toggle, .overview-workshop__authors-toggle").forEach(function (button) {
      if (button.dataset.authorToggleBound) return;
      button.dataset.authorToggleBound = "true";
      button.addEventListener("click", function () {
        var authors = button.closest(".overview-publication__authors, .overview-workshop__authors");
        if (!authors) return;
        var expanded = authors.classList.toggle("is-expanded");
        button.setAttribute("aria-expanded", String(expanded));
      });
    });
  }

  // Material's article highlighter ignores the index's data-search-exclude.
  // Unwrap only its generated marks in excluded subtrees, retaining author
  // markup and real body matches. Observe these small subtrees because the
  // highlighting manifest may arrive after document$ and fragment settling.
  function clearExcludedSearchHighlights(root) {
    root.querySelectorAll('mark[data-md-highlight]').forEach(function (mark) {
      mark.replaceWith.apply(mark, Array.from(mark.childNodes));
    });
  }

  function setupArticleSearchHighlightScope() {
    var content = document.querySelector('.md-content__inner');
    if (content === searchHighlightScopeRoot) return;
    if (searchHighlightScopeObserver) searchHighlightScopeObserver.disconnect();
    searchHighlightScopeObserver = null;
    searchHighlightScopeRoot = content;
    if (!content) return;

    var excluded = Array.from(content.querySelectorAll('[data-search-exclude]'));
    excluded.forEach(clearExcludedSearchHighlights);
    if (!excluded.length || typeof window.MutationObserver !== 'function') return;
    searchHighlightScopeObserver = new window.MutationObserver(function () {
      if (!content.isConnected || content !== searchHighlightScopeRoot) return;
      excluded.forEach(clearExcludedSearchHighlights);
    });
    excluded.forEach(function (root) {
      searchHighlightScopeObserver.observe(root, { childList: true, subtree: true });
    });
  }

  // Start each article accent on its first visible appearance, not at page
  // load: lower sections and closed details must retain their reading cue.
  function setupArticleSearchHighlightMotion() {
    var root = document.querySelector('.md-content__inner');
    if (articleSearchHighlightMotion && articleSearchHighlightMotion.root === root) return;
    if (articleSearchHighlightMotion) articleSearchHighlightMotion.dispose();
    articleSearchHighlightMotion = null;
    if (!root) return;

    var pending = new Set();
    var intersecting = new Set();
    var timers = new Set();
    var frame = 0;
    var observer = null;
    var intersection = null;
    var state = articleSearchHighlightMotion = { root: root, dispose: dispose };

    function active() {
      return articleSearchHighlightMotion === state && root.isConnected;
    }
    function visible(mark) {
      if (!active() || document.hidden || !mark.isConnected) return false;
      var toggle = document.querySelector('#__search');
      if (toggle && toggle.checked) return false;
      var details = mark.closest('details:not([open])');
      while (details && root.contains(details)) {
        var summary = Array.prototype.find.call(details.children, function (child) {
          return child.tagName === 'SUMMARY';
        });
        if (!summary || !summary.contains(mark)) return false;
        details = details.parentElement && details.parentElement.closest('details:not([open])');
      }
      if (window.getComputedStyle(mark).visibility !== 'visible') return false;
      var header = document.querySelector('.md-header');
      var top = header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
      var bottom = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      return Array.prototype.some.call(mark.getClientRects(), function (rect) {
        return rect.width > 0 && rect.height > 0 && rect.bottom > top && rect.top < bottom &&
          rect.right > 0 && rect.left < window.innerWidth;
      });
    }
    function later(callback, delay) {
      var timer = window.setTimeout(function () {
        timers.delete(timer);
        if (active()) callback();
      }, delay);
      timers.add(timer);
    }
    function reveal(mark) {
      if (!pending.has(mark) || !visible(mark)) return;
      pending.delete(mark);
      intersecting.delete(mark);
      if (intersection) intersection.unobserve(mark);
      mark.dataset.edwinosSearchHighlight = 'visible';
      later(function () {
        if (!mark.isConnected) return;
        mark.dataset.edwinosSearchHighlight = 'fading';
        later(function () {
          if (mark.isConnected) mark.dataset.edwinosSearchHighlight = 'done';
        }, 1500);
      }, 2000);
    }
    function refresh() {
      frame = 0;
      (intersection ? intersecting : pending).forEach(reveal);
    }
    function schedule() {
      if (!frame && active()) frame = window.requestAnimationFrame(refresh);
    }
    function visit(node, callback) {
      if (node.nodeType !== 1) return;
      if (node.matches('mark[data-md-highlight]')) callback(node);
      node.querySelectorAll('mark[data-md-highlight]').forEach(callback);
    }
    function register(mark) {
      if (!root.contains(mark) || mark.closest('[data-search-exclude]') ||
          mark.dataset.edwinosSearchHighlight || pending.has(mark)) return;
      pending.add(mark);
      if (intersection) intersection.observe(mark);
      else schedule();
    }
    function remove(mark) {
      pending.delete(mark);
      intersecting.delete(mark);
      if (intersection) intersection.unobserve(mark);
    }
    function dispose() {
      if (observer) observer.disconnect();
      if (intersection) intersection.disconnect();
      timers.forEach(window.clearTimeout);
      if (frame) window.cancelAnimationFrame(frame);
      ['scroll', 'resize'].forEach(function (event) { window.removeEventListener(event, schedule, true); });
      ['visibilitychange', 'change', 'toggle'].forEach(function (event) { document.removeEventListener(event, schedule, true); });
      pending.clear();
      intersecting.clear();
    }
    if (typeof window.IntersectionObserver === 'function') {
      intersection = new window.IntersectionObserver(function (entries) {
        if (!active()) return;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) intersecting.add(entry.target);
          else intersecting.delete(entry.target);
        });
        schedule();
      });
    }
    if (typeof window.MutationObserver === 'function') {
      observer = new window.MutationObserver(function (mutations) {
        if (!active()) return;
        mutations.forEach(function (mutation) {
          mutation.removedNodes.forEach(function (node) { visit(node, remove); });
          mutation.addedNodes.forEach(function (node) { visit(node, register); });
        });
      });
      observer.observe(root, { childList: true, subtree: true });
    }
    root.querySelectorAll('mark[data-md-highlight]').forEach(register);
    ['scroll', 'resize'].forEach(function (event) { window.addEventListener(event, schedule, { capture: true, passive: true }); });
    ['visibilitychange', 'change', 'toggle'].forEach(function (event) { document.addEventListener(event, schedule, true); });
  }

  function runAll() {
    finishArchiveNavigationFeedback();
    setupArticleSearchHighlightScope();
    setupArticleSearchHighlightMotion();
    setupTopGlass();
    var content = document.querySelector(".md-content__inner");
    var header = document.querySelector(".md-header");
    if (content === enhancedContent && header === enhancedHeader) return;
    enhancedContent = content;
    enhancedHeader = header;
    updateHomepageClass();
    ensureHeaderGlass();
    ensureTocGlass();
    setupHeaderSearchTransition();
    normalizePaletteButtons();
    normalizeSourceFacts();
    if (!latestSourceFacts) restoreStoredSourceFacts();
    applySourceFacts();
    watchSourceFacts();
    ensureHomeProfileLayout();
    updateBeijingTime();
    setupSearchActivation();
    setupSearchResultSummary();
    markProfileDrawerEntries();
    setSectionNavigationDepth();
    restorePrimarySidebarScroll();
    openExternalContentLinksInNewTabs();
    labelCodeBlockLanguages();
    setupCollapsibleCallouts();
    setupAuthorToggles();
    setupProgressiveImages();
    setupPdfViewers();
    setupVisitorBadge();
    afterFirstScreen(function () {
      updateSourceFacts();
      updateFriendCount();
      updateVisitorDeploymentTime();
    });
    fixOrderedListContinuity();
  }

  runAll();
  closeSearchWhenClickingAway();
  setupPrimarySidebarScrollPreservation();
  setupArchiveNavigationFeedback();
  setupSectionNavigationDepthSync();
  setInterval(updateBeijingTime, 1000);

  document.addEventListener("DOMContentLoaded", runAll);

  // MkDocs Material instant navigation support.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(runAll);
  }
})();
