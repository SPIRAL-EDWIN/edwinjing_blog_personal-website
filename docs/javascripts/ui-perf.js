/**
 * EdwinOS runtime UI adaptations.
 *
 * Owns idempotent DOM enhancements that must be reapplied after MkDocs
 * Material instant navigation (route classes, header/search, profile metadata,
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
  var tabGlassRuntime = null;
  var topGlassRuntime = null;
  var drawerGlassRuntime = null;
  var contentGlassRuntime = null;
  var controlGlassSequence = 0;
  var searchResultSummarySubscription = null;
  var searchSnippetSources = new WeakMap();
  var drawerTreeRuntime = null;
  var archiveNavigationFeedbackReady = false;
  var archiveNavigationFallbackTimer = null;
  var navigationFeedbackDelayTimer = null;
  var navigationGlassRuntime = null;
  // One pending navigation owns both Archive cards and ordinary page links.
  var activeArchiveNavigation = null;
  var mountedNavigationContent = null;
  var mountedNavigationHref = window.location.href;
  var navigationLabels = Object.create(null);
  var pdfViewers = new WeakMap();
  var activePdfViewers = [];
  var friendCountRequest = null;
  var friendCountValue = null;
  var enhancedContent = null;
  var enhancedHeader = null;
  var searchHighlightScopeRoot = null;
  var searchHighlightScopeObserver = null;
  var articleSearchHighlightMotion = null;
  var overviewRevealRuntime = null;
  var blogHomeRuntime = null;
  var contentHubRevealRuntime = null;
  var publicationPreviewRuntime = null;
  // Remains document-local across Material visits; a reload starts a fresh read.
  var overviewRevealedSections = new Set();
  var contentHubRevealedBlocks = new Set();
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
    var padding = options.padding === undefined ? 16 : options.padding;
    var referenceLens = options.profile === 'shuding';
    var referenceScale = 0;
    var motionStrength = 0;
    var mapWidth = 0, mapHeight = 0;
    var mapTransform;
    var motionMapFrozen = false;
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
      blur.setAttribute('stdDeviation', String(options.blur === undefined ? 4 : options.blur));
      blur.setAttribute('result', prefix + '-blur');
      var displacement = document.createElementNS(svgNS, 'feDisplacementMap');
      displacement.setAttribute('in', prefix + (options.edgeBlur === undefined ? '-blur' : '-optical-background'));
      displacement.setAttribute('in2', referenceLens ? prefix + '-scaled-map' : prefix + '-map');
      displacement.setAttribute('xChannelSelector', 'R');
      displacement.setAttribute('yChannelSelector', 'G');
      displacement.setAttribute('scale', String(options.strength === undefined ? 22 : options.strength));
      filter.appendChild(mapImage);
      if (referenceLens) {
        mapTransform = document.createElementNS(svgNS, 'feColorMatrix');
        mapTransform.setAttribute('in', prefix + '-map');
        mapTransform.setAttribute('type', 'matrix');
        mapTransform.setAttribute('result', prefix + '-scaled-map');
        filter.appendChild(mapTransform);
      }
      filter.appendChild(blur);
      if (options.edgeBlur !== undefined) {
        // The map's spare blue channel carries a continuous center weight.
        // Add complementary premultiplied images rather than overlaying them:
        // the transition retains full opacity and cannot form a dark seam.
        var centerMask = document.createElementNS(svgNS, 'feColorMatrix');
        centerMask.setAttribute('in', prefix + '-map');
        centerMask.setAttribute('type', 'matrix');
        centerMask.setAttribute('values', '0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 0');
        centerMask.setAttribute('result', prefix + '-center-mask');
        var edgeBlur = document.createElementNS(svgNS, 'feGaussianBlur');
        edgeBlur.setAttribute('in', 'SourceGraphic');
        edgeBlur.setAttribute('stdDeviation', String(options.edgeBlur));
        edgeBlur.setAttribute('result', prefix + '-edge-blur');
        var centerImage = document.createElementNS(svgNS, 'feComposite');
        centerImage.setAttribute('in', prefix + '-blur');
        centerImage.setAttribute('in2', prefix + '-center-mask');
        centerImage.setAttribute('operator', 'in');
        centerImage.setAttribute('result', prefix + '-center-image');
        var edgeImage = document.createElementNS(svgNS, 'feComposite');
        edgeImage.setAttribute('in', prefix + '-edge-blur');
        edgeImage.setAttribute('in2', prefix + '-center-mask');
        edgeImage.setAttribute('operator', 'out');
        edgeImage.setAttribute('result', prefix + '-edge-image');
        var opticalBackground = document.createElementNS(svgNS, 'feComposite');
        opticalBackground.setAttribute('in', prefix + '-center-image');
        opticalBackground.setAttribute('in2', prefix + '-edge-image');
        opticalBackground.setAttribute('operator', 'arithmetic');
        opticalBackground.setAttribute('k1', '0');
        opticalBackground.setAttribute('k2', '1');
        opticalBackground.setAttribute('k3', '1');
        opticalBackground.setAttribute('k4', '0');
        opticalBackground.setAttribute('result', prefix + '-optical-background');
        [centerMask, edgeBlur, centerImage, edgeImage, opticalBackground].forEach(function (primitive) {
          filter.appendChild(primitive);
        });
      }
      filter.appendChild(displacement);
      if (options.dispersion) {
        // Separate RGB sampling offsets bend the same real backdrop at the rim.
        // Neutral map center stays aligned. No colored outline is painted.
        var channels = [];
        ['R', 'G', 'B'].forEach(function (channel, index) {
          var sample = displacement.cloneNode(false);
          sample.setAttribute('scale', String(options.strength + (index - 1) * options.dispersion));
          sample.setAttribute('result', prefix + '-channel-' + index);
          filter.appendChild(sample);
          var isolate = document.createElementNS(svgNS, 'feColorMatrix');
          isolate.setAttribute('in', prefix + '-channel-' + index);
          isolate.setAttribute('type', 'matrix');
          var matrix = new Array(20).fill(0); matrix[index * 6] = 1; matrix[18] = 1;
          isolate.setAttribute('values', matrix.join(' '));
          isolate.setAttribute('result', prefix + '-rgb-' + index);
          filter.appendChild(isolate); channels.push(prefix + '-rgb-' + index);
        });
        [1, 2].forEach(function (index) {
          var add = document.createElementNS(svgNS, 'feComposite');
          add.setAttribute('in', index === 1 ? channels[0] : prefix + '-rgb-pair');
          add.setAttribute('in2', channels[index]); add.setAttribute('operator', 'arithmetic');
          add.setAttribute('k2', '1'); add.setAttribute('k3', '1');
          add.setAttribute('result', index === 1 ? prefix + '-rgb-pair' : prefix + '-spectrum'); filter.appendChild(add);
        });
      }
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
        options.radius === undefined ?
          (parseFloat(window.getComputedStyle(feedback).borderTopLeftRadius) || 24) : options.radius);
      var key = Math.round(box.width) + ':' + Math.round(box.height) + ':' + Math.round(radius);
      var sampleWidth = box.width + padding * 2;
      var sampleHeight = box.height + padding * 2;
      // During a nav width morph stretch the already-loaded map, rather than
      // replacing feImage.href with a newly encoded PNG on every frame. Region
      // changes are synchronous; raster decoding cannot temporarily remove the
      // lens or expose an incompletely covered backdrop.
      filter.setAttribute('width', sampleWidth);
      filter.setAttribute('height', sampleHeight);
      mapImage.setAttribute('x', referenceLens ? 0 : -padding);
      mapImage.setAttribute('y', referenceLens ? 0 : -padding);
      mapImage.setAttribute('width', referenceLens ? box.width : sampleWidth);
      mapImage.setAttribute('height', referenceLens ? box.height : sampleHeight);
      if (referenceLens && mapWidth) {
        var morphScale = setTabGlassMapTransform(mapTransform, box.width / mapWidth, box.height / mapHeight);
        displacement.setAttribute('scale', referenceScale * motionStrength * morphScale);
      }
      feedback.style.setProperty('--' + prefix + '-radius', radius + 'px');
      if (motionMapFrozen || key === mapKey) return;
      var pixelRatio = options.pixelRatio === undefined ? 1.5 : options.pixelRatio;
      canvas.width = Math.min(768, Math.max(24, Math.ceil((referenceLens ? box.width : sampleWidth) * pixelRatio)));
      canvas.height = Math.min(options.maxMapHeight || 512,
        Math.max(24, Math.ceil((referenceLens ? box.height : sampleHeight) * pixelRatio)));
      var pixels = context.createImageData(canvas.width, canvas.height);
      if (referenceLens) {
        referenceScale = fillTabGlassDisplacementMap(pixels, box.width, box.height);
        mapWidth = box.width; mapHeight = box.height;
        setTabGlassMapTransform(mapTransform, 1, 1);
      } else fillRoundedGlassDisplacementMap(pixels, box.width, box.height, padding, radius, options.rim, options.edge);
      if (options.edgeBlur !== undefined) {
        fillGlassBlurWeights(pixels, box.width, box.height, padding, radius, options.blurTransition || 28, options.edge);
      }
      context.putImageData(pixels, 0, 0);
      var url = canvas.toDataURL('image/png');
      mapImage.setAttribute('href', url);
      mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
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
      setStrength: function (value) {
        if (refraction) {
          motionStrength = value;
          displacement.setAttribute('scale', String(referenceLens ? referenceScale * value : value));
          if (motionMapFrozen) {
            window.cancelAnimationFrame(frame); frame = 0;
            update();
          }
        }
      },
      beginMotion: function () {
        if (disposed || !refraction) return;
        window.cancelAnimationFrame(frame); frame = 0;
        // Initial startup can precede the first scheduled optical frame.
        if (!mapKey) update();
        motionMapFrozen = true;
        if (options.datasetFrozen) feedback.dataset[options.datasetFrozen] = '1';
      },
      endMotion: function (refresh) {
        motionStrength = 0;
        motionMapFrozen = false;
        if (options.datasetFrozen) feedback.dataset[options.datasetFrozen] = '0';
        if (refraction) displacement.setAttribute('scale', '0');
        if (refresh !== false) schedule();
      },
      refresh: schedule,
      destroy: function () {
        disposed = true;
        motionMapFrozen = false;
        window.cancelAnimationFrame(frame);
        window.removeEventListener('resize', schedule);
        if (resizeObserver) resizeObserver.disconnect();
        if (definitions) definitions.remove();
        highlight.remove();
        feedback.classList.remove(prefix + '-glass', prefix + '-refraction');
        delete feedback.dataset[datasetMode];
        delete feedback.dataset[datasetBuilds];
        if (options.datasetFrozen) delete feedback.dataset[options.datasetFrozen];
        feedback.style.removeProperty('--' + prefix + '-radius');
        if (options.filterVariable) feedback.style.removeProperty(options.filterVariable);
      }
    };
  }

  window.EdwinOSGlass = { mount: function (element) {
    controlGlassSequence += 1;
    return setupLayoutControlGlass(element, {
      prefix: 'edwinos-surface', filterId: 'edwinos-surface-' + controlGlassSequence,
      filterVariable: '--edwinos-surface-filter', datasetMode: 'edwinosControlGlassMode',
      datasetBuilds: 'edwinosControlGlassBuilds', blur: 1.5, strength: 20,
      dispersion: .8, padding: 24, pixelRatio: 1
    });
  } };

  /* Safari cannot apply SVG displacement to a live CSS backdrop. This narrow
     alternative draws only the three existing navigation labels into one SVG
     source, split into complementary outside/inside clips. Original anchors
     retain layout, interaction and accessibility; their glyph fill is hidden
     only after the optical source is ready. No article/page pixels are copied. */
  function setupTabLabelGlass(header, surface) {
    var svgNS = 'http://www.w3.org/2000/svg';
    var track = header.querySelector('.edwinos-tab-glass-track');
    var canvas = document.createElement('canvas');
    var context = canvas.getContext('2d');
    if (!track || !context || typeof window.SVGFEDisplacementMapElement === 'undefined') return null;
    var padding = 16;
    var referenceScale = 0;
    var motionStrength = 0;
    var mapWidth = 0, mapHeight = 0;
    var disposed = false;
    var frozen = false;
    var resumeStableMap = false;
    var frame = 0;
    var mapKey = '';
    var builds = 0;
    var sourceReady = false;
    var geometry = null;
    var totalWidth = 0;
    var totalHeight = 0;
    var fontBaselines = new Map();
    function node(name, attributes, parent) {
      var element = document.createElementNS(svgNS, name);
      Object.keys(attributes || {}).forEach(function (key) { element.setAttribute(key, String(attributes[key])); });
      if (parent) parent.appendChild(element);
      return element;
    }
    var svg = node('svg', { 'class': 'edwinos-tab-label-optics', 'aria-hidden': 'true', focusable: 'false' }, track);
    var defs = node('defs', {}, svg);
    var source = node('g', { id: 'edwinos-tab-label-source' }, defs);
    var filter = node('filter', { id: 'edwinos-tab-label-refraction', filterUnits: 'userSpaceOnUse',
      primitiveUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' }, defs);
    var mapImage = node('feImage', { result: 'map', preserveAspectRatio: 'none' }, filter);
    var mapTransform = node('feColorMatrix', { in: 'map', type: 'matrix', result: 'scaled-map' }, filter);
    var displacement = node('feDisplacementMap', { in: 'SourceGraphic', in2: 'scaled-map', scale: 0,
      xChannelSelector: 'R', yChannelSelector: 'G' }, filter);
    var outsideClip = node('clipPath', { id: 'edwinos-tab-label-outside', clipPathUnits: 'userSpaceOnUse' }, defs);
    var outsidePath = node('path', { 'clip-rule': 'evenodd', 'fill-rule': 'evenodd' }, outsideClip);
    var insideClip = node('clipPath', { id: 'edwinos-tab-label-inside', clipPathUnits: 'userSpaceOnUse' }, defs);
    var insideRect = node('rect', {}, insideClip);
    node('use', { href: '#edwinos-tab-label-source', 'clip-path': 'url(#edwinos-tab-label-outside)' }, svg);
    var insideGroup = node('g', { 'clip-path': 'url(#edwinos-tab-label-inside)' }, svg);
    var lensGroup = node('g', { 'class': 'edwinos-tab-label-lens' }, insideGroup);
    var insideUse = node('use', { href: '#edwinos-tab-label-source' }, lensGroup);

    function deactivate() {
      delete header.dataset.edwinosTabLabelReady;
      sourceReady = false;
      svg.hidden = true;
      svg.style.display = 'none';
    }
    function baselineOffset(style, text) {
      var key = [style.fontFamily, style.fontSize, style.fontWeight, style.fontStyle, style.lineHeight].join('|');
      if (fontBaselines.has(key)) return fontBaselines.get(key);
      // Measure the actual HTML baseline relative to its font text range.
      // This preserves flex-centered Inter labels without SVG baseline guesses.
      var probe = document.createElement('span');
      probe.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;white-space:pre;pointer-events:none';
      ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'lineHeight'].forEach(function (name) {
        probe.style[name] = style[name];
      });
      var sample = document.createElement('span');
      sample.textContent = text;
      var baseline = document.createElement('span');
      baseline.style.cssText = 'display:inline-block;width:0;height:0;padding:0;vertical-align:baseline';
      probe.appendChild(sample); probe.appendChild(baseline); document.body.appendChild(probe);
      var range = document.createRange(); range.selectNodeContents(sample);
      var offset = baseline.getBoundingClientRect().top - range.getBoundingClientRect().top;
      probe.remove();
      fontBaselines.set(key, offset);
      return offset;
    }
    function rebuildSource() {
      if (disposed || surface.hidden || !surface.isConnected) { deactivate(); return false; }
      var links = Array.prototype.slice.call(header.querySelectorAll('.md-tabs__link'));
      var bounds = track.getBoundingClientRect();
      if (links.length !== 3 || !(bounds.width > 0 && bounds.height > 0)) { deactivate(); return false; }
      var labels = links.map(function (link) {
        var style = window.getComputedStyle(link);
        var range = document.createRange(); range.selectNodeContents(link);
        var box = range.getBoundingClientRect();
        var text = link.textContent.trim();
        return { text: text, x: box.left - bounds.left,
          y: box.top - bounds.top + baselineOffset(style, text), style: style };
      });
      var next = document.createDocumentFragment();
      labels.forEach(function (label) {
        var text = node('text', { x: label.x, y: label.y, fill: label.style.color,
          opacity: label.style.opacity, 'xml:space': 'preserve' }, next);
        ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'letterSpacing',
          'fontKerning', 'fontFeatureSettings', 'fontVariantLigatures', 'textTransform'].forEach(function (name) {
          text.style[name] = label.style[name];
        });
        text.textContent = label.text;
      });
      source.replaceChildren(next);
      totalWidth = bounds.width; totalHeight = bounds.height;
      svg.setAttribute('width', totalWidth); svg.setAttribute('height', totalHeight);
      svg.setAttribute('viewBox', '0 0 ' + totalWidth + ' ' + totalHeight);
      sourceReady = true;
      svg.hidden = false; svg.style.display = '';
      header.dataset.edwinosTabLabelReady = '1';
      surface.dataset.edwinosTabMode = 'label-refraction';
      return true;
    }
    function radiusFor(box) { return Math.min(box.width / 2, box.height / 2); }
    function roundedPath(box, radius) {
      var x = box.x, y = box.y, w = box.width, h = box.height, r = radius;
      return 'M' + (x + r) + ' ' + y + ' H' + (x + w - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + w) + ' ' + (y + r) +
        ' V' + (y + h - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + w - r) + ' ' + (y + h) +
        ' H' + (x + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + x + ' ' + (y + h - r) +
        ' V' + (y + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + (x + r) + ' ' + y + ' Z';
    }
    function render(box) {
      geometry = box;
      if (disposed || surface.hidden || !sourceReady) { if (surface.hidden) deactivate(); return; }
      var radius = radiusFor(box);
      ['x', 'y', 'width', 'height'].forEach(function (name) { insideRect.setAttribute(name, box[name]); });
      insideRect.setAttribute('rx', radius); insideRect.setAttribute('ry', radius);
      // Each pixel belongs to exactly one clip. The outside source is never
      // painted beneath the filtered source inside the capsule.
      outsidePath.setAttribute('d', 'M0 0 H' + totalWidth + ' V' + totalHeight + ' H0 Z ' + roundedPath(box, radius));
      // Keep raster-map and displacement subregions in lens-local coordinates
      // instead of translating their origins each frame. The outer transform
      // moves the lens; counter-translating its source preserves actual label
      // positions without moving the feImage itself.
      lensGroup.setAttribute('transform', 'translate(' + box.x + ' ' + box.y + ')');
      insideUse.setAttribute('transform', 'translate(' + (-box.x) + ' ' + (-box.y) + ')');
      [filter, mapTransform, displacement].forEach(function (element) {
        element.setAttribute('x', -padding); element.setAttribute('y', -padding);
        element.setAttribute('width', box.width + padding * 2); element.setAttribute('height', box.height + padding * 2);
      });
      mapImage.setAttribute('x', 0); mapImage.setAttribute('y', 0);
      mapImage.setAttribute('width', box.width); mapImage.setAttribute('height', box.height);
      if (mapWidth) {
        var morphScale = setTabGlassMapTransform(mapTransform, box.width / mapWidth, box.height / mapHeight);
        displacement.setAttribute('scale', referenceScale * motionStrength * morphScale);
      }
    }
    function readPosition() {
      return { x: parseFloat(surface.style.left) || 0, y: parseFloat(surface.style.top) || 0,
        width: parseFloat(surface.style.width) || 0, height: parseFloat(surface.style.height) || 0 };
    }
    function rebuildMap() {
      if (!geometry || frozen || !sourceReady) return;
      var box = geometry, radius = radiusFor(box);
      if (!(box.width > 0 && box.height > 0)) return;
      var key = Math.round(box.width) + ':' + Math.round(box.height) + ':' + Math.round(radius);
      if (key === mapKey) return;
      canvas.width = Math.min(768, Math.max(24, Math.ceil(box.width * 1.5)));
      canvas.height = Math.min(512, Math.max(24, Math.ceil(box.height * 1.5)));
      var pixels = context.createImageData(canvas.width, canvas.height);
      referenceScale = fillTabGlassDisplacementMap(pixels, box.width, box.height);
      mapWidth = box.width; mapHeight = box.height;
      setTabGlassMapTransform(mapTransform, 1, 1);
      context.putImageData(pixels, 0, 0);
      var url = canvas.toDataURL('image/png');
      mapImage.setAttribute('href', url);
      mapImage.setAttributeNS('http://www.w3.org/1999/xlink', 'href', url);
      mapKey = key; builds += 1;
      surface.dataset.edwinosTabMapBuilds = String(builds);
    }
    function update() {
      frame = 0;
      if (disposed || frozen) return;
      if (rebuildSource()) { render(readPosition()); rebuildMap(); }
    }
    function schedule() { if (!disposed && !frozen && !frame) frame = window.requestAnimationFrame(update); }
    function setStrength(value) {
      if (surface.hidden) { deactivate(); return; }
      motionStrength = value;
      var morphScale = geometry && mapWidth ? setTabGlassMapTransform(mapTransform, geometry.width / mapWidth, geometry.height / mapHeight) : 1;
      displacement.setAttribute('scale', referenceScale * value * morphScale);
      if (value > 0 && mapKey) lensGroup.setAttribute('filter', 'url(#edwinos-tab-label-refraction)');
      else lensGroup.removeAttribute('filter');
      // At rest bypassing the filter preserves exact original text even while
      // the next zero-strength endpoint map is being decoded.
    }
    function onLabelTransition(event) {
      // Palette changes can begin a short native link-color transition. Copy
      // its final color too, without polling styles or starting an idle loop.
      if ((event.propertyName === 'color' || event.propertyName === 'opacity') && event.target &&
          event.target.matches('.md-tabs__link')) schedule();
    }
    function onLabelState(event) {
      if (event.target && typeof event.target.closest === 'function' && event.target.closest('.md-tabs__link')) schedule();
    }
    var labelEvents = ['pointerover', 'pointerout', 'focusin', 'focusout'];
    labelEvents.forEach(function (name) { header.addEventListener(name, onLabelState); });
    header.addEventListener('transitionend', onLabelTransition);
    var paletteObserver = typeof window.MutationObserver === 'function' ? new MutationObserver(schedule) : null;
    if (paletteObserver) paletteObserver.observe(document.body, { attributes: true, attributeFilter: ['data-md-color-scheme'] });
    schedule();
    return {
      paint: render,
      setStrength: setStrength,
      beginMotion: function () {
        if (disposed) return;
        window.cancelAnimationFrame(frame); frame = 0;
        if (rebuildSource()) {
          render(readPosition());
          // Catch initial/layout changes at zero strength. Rapidly interrupted
          // motion keeps the same decoded map until its eventual endpoint.
          if (!resumeStableMap || !mapKey) rebuildMap();
        }
        resumeStableMap = false;
        frozen = Boolean(mapKey); surface.dataset.edwinosTabMapFrozen = frozen ? '1' : '0';
      },
      endMotion: function (refresh) {
        resumeStableMap = frozen && refresh === false;
        frozen = false; surface.dataset.edwinosTabMapFrozen = '0'; setStrength(0);
        if (refresh !== false) schedule();
      },
      refresh: function () { resumeStableMap = false; fontBaselines.clear(); schedule(); },
      destroy: function () {
        disposed = true; frozen = false;
        window.cancelAnimationFrame(frame);
        if (paletteObserver) paletteObserver.disconnect();
        header.removeEventListener('transitionend', onLabelTransition);
        labelEvents.forEach(function (name) { header.removeEventListener(name, onLabelState); });
        deactivate(); svg.remove();
        delete surface.dataset.edwinosTabMode; delete surface.dataset.edwinosTabMapBuilds;
        delete surface.dataset.edwinosTabMapFrozen;
      }
    };
  }

  /* A header sibling owns the selected glass; Material may replace the tabs
     but never our surface. The template's first-paint geometry is also the
     only positioning/reveal routine used here. Search width stays with its
     existing owner. Animation work stops completely at its endpoint. */
  function setupTabGlass() {
    var header = document.querySelector('.md-header');
    var surface = header && header.querySelector('.edwinos-tab-glass');
    if (!surface || typeof window.__edwinosTabGlassGeometry !== 'function') return;
    if (tabGlassRuntime && tabGlassRuntime.header === header) {
      tabGlassRuntime.arrive();
      return;
    }
    if (tabGlassRuntime) tabGlassRuntime.destroy();
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    // Unlike the search/top controls, this surface samples navigation text.
    // Use the reference's continuous UV shader, not a fixed-width rim or
    // normalized direction. Motion reveals crossing glyphs; rest bypasses
    // displacement to keep all navigation labels exactly sharp.
    var restingStrength = 0;
    var chromium = /\b(?:Chrome|Chromium|Edg|EdgA|OPR)\//.test(window.navigator.userAgent);
    var optics = !chromium && /\bSafari\//.test(window.navigator.userAgent) ? setupTabLabelGlass(header, surface) : null;
    if (!optics) optics = setupLayoutControlGlass(surface, {
      prefix: 'edwinos-tab', filterId: 'edwinos-tab-refraction', blur: 0, strength: restingStrength,
      padding: 16, profile: 'shuding',
      datasetMode: 'edwinosTabMode', datasetBuilds: 'edwinosTabMapBuilds', datasetFrozen: 'edwinosTabMapFrozen'
    });
    var frame = 0;
    var layoutFrame = 0;
    var current = null;
    var active = surface.dataset.edwinosTabSelected || '';
    var disposed = false;
    var observedList = null;
    var observedRail = null;
    var resize = typeof window.ResizeObserver === 'function' ? new ResizeObserver(scheduleLayout) : null;
    var hiddenDestination = null;
    var pendingLayout = false;

    function readPosition() {
      return { x: parseFloat(surface.style.left) || 0, y: parseFloat(surface.style.top) || 0,
        width: parseFloat(surface.style.width) || 0, height: parseFloat(surface.style.height) || 0 };
    }
    function paint(box) {
      ['x', 'y', 'width', 'height'].forEach(function (key) {
        surface.style[key === 'x' ? 'left' : key === 'y' ? 'top' : key] = box[key] + 'px';
      });
      current = box;
      if (optics.paint) optics.paint(box);
    }
    function place(destination, animate, reveal) {
      if (disposed) return;
      // The mobile drawer changes the rail's left edge between Overview and
      // articles. Retain the rendered SCREEN position across that replacement,
      // then convert it to the new rail; otherwise the capsule jumps sideways
      // before its requested movement begins.
      var rendered = animate && !surface.hidden ? surface.getBoundingClientRect() : null;
      var box = window.__edwinosTabGlassGeometry(header, destination, reveal);
      if (!box) return;
      window.cancelAnimationFrame(frame);
      frame = 0;
      optics.endMotion(false);
      var wasHidden = surface.hidden;
      surface.hidden = !box.selected;
      surface.dataset.edwinosTabMoving = '0';
      if (!box.selected) { active = ''; optics.setStrength(restingStrength); return; }
      var from = current || readPosition();
      if (rendered) {
        var trackBounds = header.querySelector('.edwinos-tab-glass-track').getBoundingClientRect();
        from = { x: rendered.left - trackBounds.left, y: rendered.top - trackBounds.top,
          width: rendered.width, height: rendered.height };
      }
      var changed = active !== box.key;
      active = box.key;
      surface.dataset.edwinosTabSelected = active;
      if (!animate || reduced.matches || wasHidden || !changed || !from.width) {
        paint(box); optics.setStrength(restingStrength); optics.refresh(); return;
      }
      // Track origin may have changed with the mobile drawer. Commit the
      // compensated screen position before optics read it, not one RAF later.
      paint(from);
      var started = window.performance.now();
      surface.dataset.edwinosTabMoving = '1';
      optics.beginMotion();
      function tick(now) {
        if (disposed) return;
        var progress = Math.min(1, (now - started) / 350);
        var eased = 1 - Math.pow(1 - progress, 3);
        var next = {};
        ['x', 'y', 'width', 'height'].forEach(function (key) { next[key] = from[key] + (box[key] - from[key]) * eased; });
        paint(next);
        optics.setStrength(Math.sin(Math.PI * progress));
        if (progress < 1) frame = window.requestAnimationFrame(tick);
        else {
          frame = 0; paint(box); surface.dataset.edwinosTabMoving = '0'; optics.endMotion(false); optics.setStrength(restingStrength);
          if (pendingLayout) { pendingLayout = false; place(hiddenDestination, false, true); }
          else optics.refresh();
        }
      }
      frame = window.requestAnimationFrame(tick);
    }
    function bind() {
      var list = header.querySelector('.md-tabs__list');
      var rail = header.querySelector('.md-tabs .md-grid');
      if (list !== observedList) {
        if (resize && observedList) resize.unobserve(observedList);
        observedList = list;
        if (resize && list) resize.observe(list);
      }
      if (rail !== observedRail) {
        if (observedRail) observedRail.removeEventListener('scroll', onRailScroll);
        if (resize && observedRail) resize.unobserve(observedRail);
        observedRail = rail;
        if (rail) {
          rail.addEventListener('scroll', onRailScroll, { passive: true });
          if (resize) resize.observe(rail);
        }
      }
    }
    function onRailScroll() {
      // Reader scrolling follows the rail without forcing it back. Automatic
      // arrival/resize positioning reveals the selected link separately.
      if (!frame) place(hiddenDestination, false, false);
    }
    function scheduleLayout() {
      if (disposed || layoutFrame) return;
      layoutFrame = window.requestAnimationFrame(function () {
        layoutFrame = 0;
        if (frame) pendingLayout = true;
        else place(hiddenDestination, false, true);
      });
    }
    function onMotionPreference() {
      if (reduced.matches) { pendingLayout = false; place(hiddenDestination, false, true); }
    }
    tabGlassRuntime = {
      header: header,
      arrive: function () {
        hiddenDestination = null;
        bind();
        place(null, true, true);
      },
      prepareSearchDestination: function (destination) {
        // Destination is captured while the search window still covers the
        // tabs. Same-section closing has no geometry/animation side effects.
        var box = window.__edwinosTabGlassGeometry(header, destination, false);
        if (box && box.selected && box.key === active) return;
        hiddenDestination = destination;
        place(destination, false, true);
      },
      destroy: function () {
        disposed = true;
        window.cancelAnimationFrame(frame);
        window.cancelAnimationFrame(layoutFrame);
        if (resize) resize.disconnect();
        if (observedRail) observedRail.removeEventListener('scroll', onRailScroll);
        window.removeEventListener('resize', scheduleLayout);
        if (reduced.removeEventListener) reduced.removeEventListener('change', onMotionPreference);
        else if (reduced.removeListener) reduced.removeListener(onMotionPreference);
        if (document.fonts) document.fonts.removeEventListener('loadingdone', scheduleLayout);
        optics.destroy();
      }
    };
    header.dataset.edwinosTabGlassReady = '1';
    bind();
    place(null, false, true);
    window.addEventListener('resize', scheduleLayout, { passive: true });
    if (reduced.addEventListener) reduced.addEventListener('change', onMotionPreference);
    else if (reduced.addListener) reduced.addListener(onMotionPreference);
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', scheduleLayout);
      document.fonts.ready.then(scheduleLayout);
    }
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

  // One observer owns content glass surfaces. Only nearby surfaces hold an
  // optical map; Material still owns the links, copy buttons and feedback.
  function setupContentGlass() {
    var content = document.querySelector('.md-content__inner');
    if (contentGlassRuntime && contentGlassRuntime.content === content) return;
    if (contentGlassRuntime) contentGlassRuntime.destroy();
    contentGlassRuntime = null;
    if (!content) return;
    var records = new Map();
    var disposed = false;
    var discovery = null;
    var visibility = typeof window.IntersectionObserver === 'function' ?
      new window.IntersectionObserver(function (entries) {
        if (disposed) return;
        entries.forEach(function (entry) {
          var record = records.get(entry.target);
          if (!record) return;
          if (entry.isIntersecting) initialize(record);
          else if (record.optics) { record.optics.destroy(); record.optics = null; }
        });
      }, { rootMargin: '48px' }) : null;

    function initialize(record) {
      if (disposed || record.optics || !record.element.isConnected) return;
      if (record.name === 'surface') { record.optics = window.EdwinOSGlass.mount(record.element); return; }
      var name = record.name;
      var prefix = 'edwinos-' + name;
      controlGlassSequence += 1;
      record.optics = setupLayoutControlGlass(record.element, {
        prefix: prefix,
        filterId: prefix + '-refraction-' + controlGlassSequence,
        filterVariable: '--' + prefix + '-filter',
        datasetMode: 'edwinosControlGlassMode',
        datasetBuilds: 'edwinosControlGlassBuilds',
        blur: record.blur,
        strength: record.strength,
        padding: 12
      });
    }
    function register(element, name, blur, strength) {
      if (records.has(element)) return;
      var record = { element: element, name: name, blur: blur, strength: strength, optics: null };
      records.set(element, record);
      if (visibility) visibility.observe(element);
      else {
        var box = element.getBoundingClientRect();
        if (box.bottom > 0 && box.top < window.innerHeight) initialize(record);
      }
    }
    function discoverCopyControls() {
      // A future select-lines toolbar is not a single-copy glass control.
      content.querySelectorAll('.md-code__nav').forEach(function (nav) {
        var buttons = nav.querySelectorAll('.md-code__button');
        if (buttons.length === 1 && buttons[0].getAttribute('data-md-type') === 'copy') {
          register(nav, 'copy', 2.5, 8);
        }
      });
      records.forEach(function (record, element) {
        if (element.isConnected) return;
        if (record.optics) record.optics.destroy();
        if (visibility) visibility.unobserve(element);
        records.delete(element);
      });
    }
    content.querySelectorAll('.profile-actions > .btn-github-action').forEach(function (element) {
      register(element, 'profile-action', 3.5, 10);
    });
    document.querySelectorAll('.edwinos-header-academic').forEach(function (element) {
      register(element, 'surface', 1.5, 20);
    });
    content.querySelectorAll('.blog-home .edwinos-glass').forEach(function (element) {
      register(element, 'surface', 1.5, 20);
    });
    content.querySelectorAll('.archive-hero__stats > span').forEach(function (element) {
      register(element, 'archive-stat', 5, 10);
    });
    content.querySelectorAll('.notes-landing .landing-route').forEach(function (element) {
      register(element, 'landing-route', 4, 18);
    });
    discoverCopyControls();
    if (typeof window.MutationObserver === 'function' && content.querySelector('pre')) {
      discovery = new window.MutationObserver(function (mutations) {
        if (disposed) return;
        var changed = mutations.some(function (mutation) {
          return Array.prototype.some.call(mutation.addedNodes, function (node) {
            return node.nodeType === 1 && (node.matches('.md-code__nav, .md-code__button') ||
              node.querySelector('.md-code__nav, .md-code__button'));
          }) || Array.prototype.some.call(mutation.removedNodes, function (node) {
            return node.nodeType === 1 && (node.matches('.md-code__nav') || node.querySelector('.md-code__nav'));
          });
        });
        if (changed) discoverCopyControls();
      });
      discovery.observe(content, { childList: true, subtree: true });
    }
    contentGlassRuntime = {
      content: content,
      destroy: function () {
        disposed = true;
        if (visibility) visibility.disconnect();
        if (discovery) discovery.disconnect();
        records.forEach(function (record) { if (record.optics) record.optics.destroy(); });
        records.clear();
      }
    };
  }

  // Keep the native drawer transform. During its bounded transition only the
  // displacement gain changes; the decoded map and the live backdrop persist.
  function setupDrawerGlass() {
    var sidebar = document.querySelector('.md-sidebar--primary');
    var toggle = document.querySelector('[data-md-toggle="drawer"]');
    if (drawerGlassRuntime && drawerGlassRuntime.sidebar === sidebar && drawerGlassRuntime.toggle === toggle) {
      drawerGlassRuntime.sync();
      return;
    }
    if (drawerGlassRuntime) drawerGlassRuntime.destroy();
    drawerGlassRuntime = null;
    if (!sidebar || !toggle || !window.matchMedia) return;
    var mobile = window.matchMedia('(max-width: 76.234375em)');
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var optics = null;
    var frame = 0;
    var closeTimer = 0;
    var disposed = false;
    var opened = false;
    var enabled = false;
    var gain = 6;
    function stop() {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(closeTimer);
      frame = 0;
      closeTimer = 0;
    }
    function release() {
      stop();
      if (optics) optics.destroy();
      optics = null;
      gain = 6;
      delete sidebar.dataset.edwinosDrawerMoving;
    }
    function initialize() {
      if (optics) return;
      optics = setupLayoutControlGlass(sidebar, {
        prefix: 'edwinos-drawer', filterId: 'edwinos-drawer-refraction',
        filterVariable: '--edwinos-drawer-filter',
        datasetMode: 'edwinosDrawerMode', datasetBuilds: 'edwinosDrawerMapBuilds',
        blur: 14, edgeBlur: 2, blurTransition: 96, edge: 'right',
        strength: 6, radius: 16, padding: 24, rim: 10,
        pixelRatio: 1, maxMapHeight: 1536
      });
    }
    function animate(closing) {
      stop();
      if (!optics || motion.matches || document.hidden) {
        if (closing) release();
        else if (optics) { gain = 6; optics.setStrength(gain); }
        return;
      }
      if (sidebar.dataset.edwinosDrawerMode !== 'refraction') {
        // Safari's native blur must remain on the panel until it has slid out.
        if (closing) closeTimer = window.setTimeout(release, 320);
        return;
      }
      // A positive baseline means closing never abruptly switches refraction
      // off while the panel is still visible. No geometry is read per frame.
      var start = window.performance.now();
      var duration = 320;
      var initialGain = gain;
      sidebar.dataset.edwinosDrawerMoving = '1';
      function tick(now) {
        if (disposed || !optics) return;
        var progress = Math.max(0, Math.min(1, (now - start) / duration));
        gain = 6 + (initialGain - 6) * (1 - progress) +
          Math.sin(Math.PI * progress) * (12 - initialGain);
        optics.setStrength(gain);
        if (progress < 1) frame = window.requestAnimationFrame(tick);
        else {
          frame = 0;
          delete sidebar.dataset.edwinosDrawerMoving;
          if (closing) release();
        }
      }
      frame = window.requestAnimationFrame(tick);
    }
    function sync() {
      if (disposed) return;
      var active = mobile.matches && Boolean(currentDrawerSection());
      var nextOpen = active && toggle.checked;
      var changed = active !== enabled || nextOpen !== opened;
      enabled = active;
      opened = nextOpen;
      if (!active) { release(); return; }
      if (nextOpen) initialize();
      if (changed) animate(!nextOpen);
    }
    function onDepthChange(event) {
      if (opened && event.target.matches('.md-nav__toggle')) animate(false);
    }
    function onMotionChange() {
      stop();
      delete sidebar.dataset.edwinosDrawerMoving;
      if (!opened || document.hidden) release();
      else { initialize(); gain = 6; optics.setStrength(gain); }
    }
    function listen(query, callback, remove) {
      if (query.addEventListener) query[remove ? 'removeEventListener' : 'addEventListener']('change', callback);
      else query[remove ? 'removeListener' : 'addListener'](callback);
    }
    toggle.addEventListener('change', sync);
    sidebar.addEventListener('change', onDepthChange);
    document.addEventListener('visibilitychange', onMotionChange);
    listen(mobile, sync);
    listen(motion, onMotionChange);
    drawerGlassRuntime = {
      sidebar: sidebar, toggle: toggle, sync: sync,
      destroy: function () {
        disposed = true;
        release();
        toggle.removeEventListener('change', sync);
        sidebar.removeEventListener('change', onDepthChange);
        document.removeEventListener('visibilitychange', onMotionChange);
        listen(mobile, sync, true);
        listen(motion, onMotionChange, true);
      }
    };
    sync();
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
    // The head bridge already retired previews for initial image loads. Reuse
    // its single owner when Material mounts cached images on instant navigation.
    if (window.edwinosImagePreviews) window.edwinosImagePreviews.refresh();
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
      document.title = document.querySelector(".blog-home") ? "Chen Jing (经宸) | Notes & Experiments" : "Chen Jing (经宸) | Zhejiang University";
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

      for (var layerIndex = 1; layerIndex <= 7; layerIndex += 1) {
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
  function fillRoundedGlassDisplacementMap(pixels, width, height, padding, radius, rimWidth, edge) {
    var sampleWidth = width + padding * 2;
    var sampleHeight = height + padding * 2;
    var rim = rimWidth === undefined ? Math.min(7, radius * 0.4) :
      Math.min(rimWidth, radius * 0.6);
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
          var t = Math.max(0, Math.min(1, depth / rim));
          var profile = 1 - 3 * t * t + 2 * t * t * t;
          dx = vx / length * profile;
          dy = vy / length * profile;
        }
        if (edge === 'right') {
          // The drawer is flush against the left viewport edge. Only its free
          // right silhouette bends the page, including the rounded corners.
          var rightWeight = Math.max(0, Math.min(1, (px - (width - radius)) / radius));
          rightWeight = rightWeight * rightWeight * (3 - 2 * rightWeight);
          dx *= rightWeight;
          dy *= rightWeight;
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

  // Preserve displacement in R/G. The drawer's free right edge alone owns
  // its blur ramp; other surfaces retain the rounded-perimeter default.
  function fillGlassBlurWeights(pixels, width, height, padding, radius, transition, edge) {
    var sampleWidth = width + padding * 2;
    var sampleHeight = height + padding * 2;
    for (var y = 0; y < pixels.height; y += 1) {
      for (var x = 0; x < pixels.width; x += 1) {
        var px = (x + 0.5) * sampleWidth / pixels.width - padding;
        var py = (y + 0.5) * sampleHeight / pixels.height - padding;
        var qx = Math.abs(px - width / 2) - (width / 2 - radius);
        var qy = Math.abs(py - height / 2) - (height / 2 - radius);
        var depth = edge === 'right' ? width - px :
          radius - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
        var weight = Math.max(0, Math.min(1, depth / transition));
        weight = weight * weight * weight * (weight * (weight * 6 - 15) + 10);
        pixels.data[(y * pixels.width + x) * 4 + 2] = Math.round(weight * 255);
      }
    }
    return pixels;
  }

  /* Navigation reproduces Shu Ding's fragment and RG encoding. Its SDF and
     two smoothsteps generate one continuous UV field, without a rim cutoff.
     The returned scale is derived from physical offsets at the actual size;
     motion supplies only a 0..1 envelope. Attribution: liquid-glass-MIT.txt. */
  function fillTabGlassDisplacementMap(pixels, width, height) {
    function smoothStep(a, b, value) {
      var t = Math.max(0, Math.min(1, (value - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
    var offsets = new Float32Array(pixels.width * pixels.height * 2);
    var maxScale = 0, cursor = 0;
    for (var y = 0; y < pixels.height; y += 1) {
      for (var x = 0; x < pixels.width; x += 1) {
        var ix = x / pixels.width - 0.5;
        var iy = y / pixels.height - 0.5;
        var qx = Math.abs(ix) - 0.3 + 0.6;
        var qy = Math.abs(iy) - 0.2 + 0.6;
        var distance = Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - 0.6;
        var scaled = smoothStep(0, 1, smoothStep(0.8, 0, distance - 0.15));
        var dx = ix * (scaled - 1) * width;
        var dy = iy * (scaled - 1) * height;
        offsets[cursor++] = dx; offsets[cursor++] = dy;
        maxScale = Math.max(maxScale, Math.abs(dx), Math.abs(dy));
      }
    }
    maxScale *= 0.5;
    cursor = 0;
    for (var at = 0; at < pixels.data.length; at += 4) {
      pixels.data[at] = maxScale ? (offsets[cursor++] / maxScale + 0.5) * 255 : 128;
      pixels.data[at + 1] = maxScale ? (offsets[cursor++] / maxScale + 0.5) * 255 : 128;
      pixels.data[at + 2] = 0; pixels.data[at + 3] = 255;
    }
    return maxScale;
  }

  function setTabGlassMapTransform(matrix, scaleX, scaleY) {
    // Stretching UVs alone is insufficient: physical X/Y offsets must follow
    // width/height independently, without a new PNG decode during movement.
    // Keep RG values within range even when the capsule grows. The common
    // factor moves to feDisplacementMap.scale, preventing matrix clipping.
    var common = Math.max(scaleX, scaleY);
    scaleX /= common; scaleY /= common;
    matrix.setAttribute('values', scaleX + ' 0 0 0 ' + (0.5 * (1 - scaleX)) +
      ' 0 ' + scaleY + ' 0 0 ' + (0.5 * (1 - scaleY)) + ' 0 0 1 0 0 0 0 0 1 0');
    return common;
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
    listeners.push(trackSearchScrollLock());
    var tabsResizeObserver = null;
    var observedTabs = null;
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
      var tabs = header.querySelector('.md-tabs__list');
      if (tabsResizeObserver && tabs !== observedTabs) {
        if (observedTabs) tabsResizeObserver.unobserve(observedTabs);
        observedTabs = tabs;
        if (tabs) tabsResizeObserver.observe(tabs);
      }
      if (tabs && (!document.fonts || document.fonts.status !== 'loading')) {
        // The root owns the dependent search/source coordinate calculations.
        var tabsWidth = tabs.getBoundingClientRect().width;
        var rootStyle = document.documentElement.style;
        var value = tabsWidth + 'px';
        if (tabsWidth > 0 && rootStyle.getPropertyValue('--edwinos-header-tabs-width') !== value) {
          rootStyle.setProperty('--edwinos-header-tabs-width', value);
        }
      }
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
      tabsResizeObserver = resize;
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
      listen(document.fonts, 'loadingdone', refresh);
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

  function trackSearchScrollLock() {
    // Material fixes the body while mobile search is open, then unlocks and
    // scrollTo's its saved offset in the same task. Keep that restoration out
    // of the site's smooth-scroll behavior, including reduced-motion mode.
    var root = document.documentElement;
    var body = document.body;
    var releaseFrame = 0;
    if (typeof window.MutationObserver !== "function") return function () {};

    function sync() {
      window.cancelAnimationFrame(releaseFrame);
      releaseFrame = 0;
      if (body.hasAttribute("data-md-scrolllock")) {
        root.classList.add("edwinos-search-scroll-locked");
      } else if (root.classList.contains("edwinos-search-scroll-locked")) {
        // Mutation observers run after Material's synchronous scroll restore.
        releaseFrame = window.requestAnimationFrame(function () {
          releaseFrame = 0;
          if (!body.hasAttribute("data-md-scrolllock")) {
            root.classList.remove("edwinos-search-scroll-locked");
          }
        });
      }
    }

    var observer = new MutationObserver(sync);
    observer.observe(body, { attributes: true, attributeFilter: ["data-md-scrolllock"] });
    sync();
    return function () {
      observer.disconnect();
      window.cancelAnimationFrame(releaseFrame);
      root.classList.remove("edwinos-search-scroll-locked");
    };
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
      if (tabGlassRuntime) tabGlassRuntime.prepareSearchDestination(destination.href);
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
      ".academic-home-layout .academic-content .visitor-container, .blog-home .visitor-container"
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
        label: "More",
        rootPath: "/经验分享/"
      };
    }

    return null;
  }

  function setSectionNavigationDepth() {
    var section = currentDrawerSection();
    if (!section) {
      if (drawerTreeRuntime) drawerTreeRuntime.destroy();
      drawerTreeRuntime = null;
      return;
    }

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

    if (primarySidebarIsDesktop()) {
      sectionRootToggle.disabled = false;
    } else {
      sectionRootToggle.checked = true;
      sectionRootToggle.disabled = true;
      sectionNav.setAttribute("aria-expanded", "true");
    }
    setupDrawerTree(sectionNav, section.key);
  }

  // Disclosure navigation, not an ARIA tree: native links and checkboxes retain
  // their responsibilities. Only mobile groups change from panels to inline
  // rows. Desktop and mobile keep separate expansion state across breakpoints.
  function setupDrawerTree(root, sectionKey) {
    if (drawerTreeRuntime && drawerTreeRuntime.root === root) {
      drawerTreeRuntime.sync();
      return;
    }
    if (drawerTreeRuntime) drawerTreeRuntime.destroy();
    var records = [];
    var mobile = !primarySidebarIsDesktop();
    root.querySelectorAll('input.md-nav__toggle[id^="__nav_"], input.md-nav__toggle[id="__toc"]').forEach(function (toggle) {
      var item = toggle.parentElement;
      var group = Array.prototype.find.call(item.children, function (child) {
        return child.matches && child.matches('nav.md-nav');
      });
      var control = item.querySelector('label[for="' + toggle.id + '"]');
      if (!group || !control || !control.querySelector('.md-nav__icon')) return;
      // Querying the direct disclosure before the group's hidden native title
      // also handles index folders whose anchor and toggle share a container.
      var topLevel = item.parentElement === root.querySelector(':scope > .md-nav__list');
      var record = {toggle: toggle, group: group, control: control,
        mobileChecked: toggle.checked,
        desktopChecked: sectionKey === 'enotes' && topLevel ? true : toggle.checked,
        tabindex: control.getAttribute('tabindex'), role: control.getAttribute('role'),
        ariaLabel: control.getAttribute('aria-label'),
        groupId: group.getAttribute('id')};
      group.id = group.id || toggle.id + '__tree';
      group.classList.add('edwinos-drawer-tree-group');
      control.classList.add('edwinos-drawer-tree-toggle');
      control.setAttribute('aria-controls', group.id);
      var name = item.querySelector(':scope > .md-nav__container > a.md-nav__link');
      if (name) control.setAttribute('aria-label', name.textContent.trim());
      records.push(record);
    });
    function reflect(record) {
      record.control.setAttribute('aria-expanded', String(record.toggle.checked));
      record.group.setAttribute('aria-expanded', String(record.toggle.checked));
      record.group.inert = mobile && !record.toggle.checked;
      if (mobile) {
        record.control.setAttribute('role', 'button');
        record.control.setAttribute('tabindex', '0');
      } else {
        if (record.role === null) record.control.removeAttribute('role');
        else record.control.setAttribute('role', record.role);
        if (record.tabindex === null) record.control.removeAttribute('tabindex');
        else record.control.setAttribute('tabindex', record.tabindex);
      }
    }
    function sync() {
      var nextMobile = !primarySidebarIsDesktop();
      if (nextMobile !== mobile) {
        records.forEach(function (record) {
          record[mobile ? 'mobileChecked' : 'desktopChecked'] = record.toggle.checked;
          record.toggle.checked = record[nextMobile ? 'mobileChecked' : 'desktopChecked'];
        });
        mobile = nextMobile;
      }
      records.forEach(reflect);
    }
    function setExpanded(record, expanded) {
      record.toggle.checked = expanded;
      record.toggle.dispatchEvent(new Event('change', {bubbles: true}));
    }
    function change(event) {
      records.forEach(function (record) {
        if (event.target !== record.toggle) return;
        record[mobile ? 'mobileChecked' : 'desktopChecked'] = record.toggle.checked;
        reflect(record);
      });
    }
    function visibleControls(scope) {
      return Array.from(scope.querySelectorAll('.edwinos-drawer-tree-toggle, a.md-nav__link[href]')).filter(function (control) {
        return !control.closest('[inert]') && control.getClientRects().length &&
          window.getComputedStyle(control).visibility !== 'hidden';
      });
    }
    function keydown(event) {
      if (!mobile || event.altKey || event.ctrlKey || event.metaKey) return;
      var control = event.target.closest('.edwinos-drawer-tree-toggle, a.md-nav__link[href]');
      if (!control || !root.contains(control)) return;
      var record = records.find(function (entry) { return entry.control === control; });
      var controls, index, target;
      if ((event.key === 'Enter' || event.key === ' ') && record) {
        setExpanded(record, !record.toggle.checked);
      } else if (event.key === 'ArrowRight' && record) {
        if (!record.toggle.checked) setExpanded(record, true);
        else target = visibleControls(record.group)[0];
      } else if (event.key === 'ArrowLeft') {
        if (record && record.toggle.checked) setExpanded(record, false);
        else {
          var parent = control.closest('.edwinos-drawer-tree-group');
          var owner = records.find(function (entry) { return entry.group === parent; });
          target = owner && owner.control;
        }
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].indexOf(event.key) !== -1) {
        controls = visibleControls(root);
        index = controls.indexOf(control);
        if (event.key === 'Home') target = controls[0];
        else if (event.key === 'End') target = controls[controls.length - 1];
        else target = controls[Math.max(0, Math.min(controls.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      } else return;
      // Stop before Material's label key handler: Enter/Space must toggle once.
      event.preventDefault();
      event.stopPropagation();
      if (target) target.focus();
    }
    root.addEventListener('change', change);
    root.addEventListener('keydown', keydown, true);
    // Capture the authored mobile state before applying desktop's established
    // first-level ENotes expansion. Repeated enhancement never resets a reader.
    records.forEach(function (record) {
      if (!mobile) record.toggle.checked = record.desktopChecked;
      reflect(record);
    });
    drawerTreeRuntime = {root: root, sync: sync, destroy: function () {
      root.removeEventListener('change', change);
      root.removeEventListener('keydown', keydown, true);
      records.forEach(function (record) {
        record.group.inert = false;
        record.group.classList.remove('edwinos-drawer-tree-group');
        record.control.classList.remove('edwinos-drawer-tree-toggle');
        record.control.removeAttribute('aria-controls');
        record.control.removeAttribute('aria-expanded');
        if (record.ariaLabel === null) record.control.removeAttribute('aria-label');
        else record.control.setAttribute('aria-label', record.ariaLabel);
        if (record.role === null) record.control.removeAttribute('role');
        else record.control.setAttribute('role', record.role);
        if (record.tabindex === null) record.control.removeAttribute('tabindex');
        else record.control.setAttribute('tabindex', record.tabindex);
        if (record.groupId === null) record.group.removeAttribute('id');
      });
    }};
  }

  function setupSectionNavigationDepthSync() {
    if (typeof window.matchMedia !== "function") return;

    var media = window.matchMedia(PRIMARY_SIDEBAR_DESKTOP_QUERY);
    // This listener fires only when crossing the breakpoint, not per resize
    // frame. Restore expansion and focusability before the next layout paints.
    var syncNavigationDepth = function () { setSectionNavigationDepth(); };
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

  // Static images retain their existing preload/decode owner. Clips have no src
  // until bounded, local reader intent; only an actual presented frame covers img.
  function setupPublicationPreviews() {
    var root = document.querySelector(".md-content__inner");
    if (publicationPreviewRuntime && publicationPreviewRuntime.root === root) return;
    if (publicationPreviewRuntime) publicationPreviewRuntime.dispose();
    publicationPreviewRuntime = null;
    if (!root) return;
    var media = Array.from(root.querySelectorAll(".overview-publication__media--preview"));
    if (!media.length) return;
    var motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    var connection = navigator.connection;
    var active = null;
    var prepared = null;
    var disposed = false;
    var removers = [];
    var states = [];
    function listen(target, event, callback, options) {
      target.addEventListener(event, callback, options);
      removers.push(function () { target.removeEventListener(event, callback, options); });
    }
    function automaticAllowed() {
      return finePointer.matches && !motion.matches && !(connection && connection.saveData);
    }
    function onScreen(state) {
      var rect = state.media.getBoundingClientRect();
      return state.media.isConnected && rect.bottom > 0 && rect.top < window.innerHeight &&
        rect.right > 0 && rect.left < window.innerWidth;
    }
    function label(state, text, action) {
      state.button.textContent = text;
      state.button.setAttribute("aria-label", action + ": " + state.description);
    }
    function clearPending(state) {
      window.clearTimeout(state.warmTimer);
      window.clearTimeout(state.startTimer);
      window.clearTimeout(state.timeout);
      state.warmTimer = state.startTimer = state.timeout = null;
      if (state.frame != null && state.video.cancelVideoFrameCallback) state.video.cancelVideoFrameCallback(state.frame);
      if (state.raf != null) window.cancelAnimationFrame(state.raf);
      state.frame = state.raf = null;
    }
    function stop(state) {
      state.generation += 1;
      state.wanted = false;
      clearPending(state);
      state.video.pause();
      state.media.classList.remove("is-preview-playing", "is-preview-loading");
      state.button.setAttribute("aria-pressed", "false");
      label(state, state.failed ? "Retry preview" : "Play preview", state.failed ? "Retry preview" : "Play preview");
      if (active === state) active = null;
    }
    function release(state) {
      stop(state);
      if (state.video.hasAttribute("src")) {
        state.video.removeAttribute("src");
        state.video.load();
      }
      if (prepared === state) prepared = null;
    }
    function fail(state) {
      if (disposed || !state.video.hasAttribute("src")) return;
      state.failed = true;
      state.media.classList.add("is-preview-error");
      release(state);
    }
    function prepare(state, explicit) {
      if (disposed || document.hidden || !onScreen(state) || (state.failed && !explicit)) return false;
      // Warming is one target at a time, and never interrupts an active preview.
      if (active && active !== state) return false;
      if (explicit && state.failed) {
        state.failed = false;
        state.media.classList.remove("is-preview-error");
      }
      if (prepared && prepared !== state) release(prepared);
      prepared = state;
      if (!state.video.hasAttribute("src")) {
        state.video.src = state.src;
        state.video.preload = "auto";
        state.video.load();
      }
      return true;
    }
    function start(state, explicit) {
      if (disposed || document.hidden || !onScreen(state) || (!explicit && !automaticAllowed())) return;
      if (active && active !== state) stop(active);
      if (!prepare(state, explicit)) return;
      if (state.wanted) return;
      // Each preview tells the complete short action, beginning at its start.
      try { if (state.video.currentTime) state.video.currentTime = 0; } catch (error) {}
      state.wanted = true;
      state.playConfirmed = false;
      state.manual = explicit;
      active = state;
      var generation = ++state.generation;
      state.media.classList.add("is-preview-loading");
      state.button.setAttribute("aria-pressed", "true");
      label(state, "Loading…", "Loading preview");
      function current() { return !disposed && state.wanted && generation === state.generation; }
      function reveal() {
        state.frame = state.raf = null;
        if (!current() || state.video.paused || document.hidden || !onScreen(state)) return;
        window.clearTimeout(state.timeout);
        state.media.classList.remove("is-preview-loading");
        state.media.classList.add("is-preview-playing");
        label(state, "Pause", "Pause preview");
      }
      // requestVideoFrameCallback confirms the decoded frame reached composition.
      // Older browsers require play() resolution + HAVE_CURRENT_DATA + two paints.
      function awaitFrame() {
        if (!current()) return;
        if (state.video.requestVideoFrameCallback) state.frame = state.video.requestVideoFrameCallback(reveal);
        else if (state.video.readyState >= 2) {
          state.raf = window.requestAnimationFrame(function () {
            state.raf = window.requestAnimationFrame(reveal);
          });
        }
      }
      state.awaitFrame = awaitFrame;
      state.timeout = window.setTimeout(function () { if (current()) fail(state); }, 12000);
      try {
        var promise = state.video.play();
        if (promise && promise.then) promise.then(function () {
          if (current()) { state.playConfirmed = true; awaitFrame(); }
          // A stale resolution must not pause a newer request on the same video.
          else if (!state.wanted) state.video.pause();
        }, function () { if (current()) fail(state); });
        else { state.playConfirmed = true; awaitFrame(); }
      } catch (error) { fail(state); }
    }
    media.forEach(function (element) {
      var video = element.querySelector("video[data-preview-src]");
      var button = element.querySelector(".overview-publication__preview-toggle");
      if (!video || !button) return;
      var raw = video.getAttribute("data-preview-src");
      // Authored data is validated at build time; also reject unsafe runtime DOM.
      if (!/^assets\/videos\/publications\/[A-Za-z0-9_./-]+\.(mp4|webm)$/i.test(raw) || raw.split("/").indexOf("..") !== -1) return;
      var src = new URL(raw, window.location.href);
      if (src.origin !== window.location.origin) return;
      var state = { media: element, video: video, button: button, src: src.href,
        description: button.getAttribute("data-preview-description"), generation: 0,
        wanted: false, manual: false, failed: false, frame: null, raf: null };
      states.push(state);
      video.muted = true;
      video.hidden = false;
      button.hidden = false;
      listen(video, "error", function () { fail(state); });
      listen(video, "loadeddata", function () {
        if (state.wanted && state.playConfirmed && !video.requestVideoFrameCallback && !video.paused && state.awaitFrame) state.awaitFrame();
      });
      listen(button, "click", function () {
        if (state.wanted) stop(state);
        else start(state, true);
      });
      listen(button, "focus", function () {
        if (!(connection && connection.saveData) && !motion.matches) prepare(state, false);
      });
      listen(element, "focusout", function (event) {
        if (!element.contains(event.relatedTarget)) stop(state);
      });
      listen(element, "pointerenter", function (event) {
        if (event.pointerType === "touch" || !automaticAllowed() || state.failed) return;
        // A short pass across the image does not start a download.
        state.startTimer = window.setTimeout(function () { start(state, false); }, 80);
      });
      listen(element, "pointerleave", function (event) {
        if (event.pointerType !== "touch") stop(state);
      });
      var row = element.closest(".overview-publication") || element;
      listen(row, "pointermove", function (event) {
        if (event.pointerType === "touch" || !automaticAllowed() || state.failed || video.hasAttribute("src")) return;
        var rect = element.getBoundingClientRect();
        var near = event.clientX >= rect.left - 80 && event.clientX <= rect.right + 80 &&
          event.clientY >= rect.top - 80 && event.clientY <= rect.bottom + 80;
        if (!near) { window.clearTimeout(state.warmTimer); state.warmTimer = null; return; }
        if (!state.warmTimer) state.warmTimer = window.setTimeout(function () {
          state.warmTimer = null;
          if (automaticAllowed()) prepare(state, false);
        }, 120);
      }, { passive: true });
      listen(row, "pointerleave", function () {
        window.clearTimeout(state.warmTimer); state.warmTimer = null;
      });
    });
    var observer = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) states.forEach(function (state) {
          if (state.media === entry.target) stop(state);
        });
      });
    }) : null;
    if (observer) states.forEach(function (state) { observer.observe(state.media); });
    // Fallback only needs a bounded check while there is active or pending intent.
    else listen(window, "scroll", function () {
      states.forEach(function (state) { if (!onScreen(state)) stop(state); });
    }, { passive: true });
    listen(document, "visibilitychange", function () {
      if (document.hidden) states.forEach(stop);
    });
    listen(window, "pagehide", function () { states.forEach(stop); });
    function onPreferences() {
      if (!automaticAllowed()) states.forEach(function (state) {
        window.clearTimeout(state.warmTimer);
        window.clearTimeout(state.startTimer);
        state.warmTimer = state.startTimer = null;
        if (!state.manual) stop(state);
      });
    }
    [motion, finePointer, connection].forEach(function (target) {
      if (target && target.addEventListener) listen(target, "change", onPreferences);
    });
    publicationPreviewRuntime = { root: root, dispose: function () {
      disposed = true;
      if (observer) observer.disconnect();
      removers.forEach(function (remove) { remove(); });
      states.forEach(function (state) { release(state); state.button.hidden = true; state.video.hidden = true; });
    } };
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

  // The introduction hubs use Overview's 16px/800ms entrance without touching
  // its disclosure state machine. Default HTML stays readable; WAAPI releases
  // its effects at completion. Individual cards use translate independently
  // of their hover transform; neither article groups nor sidebar parents move.
  function setupContentHubReveal() {
    var root = document.querySelector('.notes-landing');
    if (contentHubRevealRuntime && contentHubRevealRuntime.root === root) return;
    if (contentHubRevealRuntime) contentHubRevealRuntime.dispose();
    contentHubRevealRuntime = null;
    if (!root) return;
    var route = navigationPageKey(window.location.href);
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var desktop = window.matchMedia(PRIMARY_SIDEBAR_DESKTOP_QUERY);
    var records = [];
    var animations = new Map();
    var queued = new Map();
    var observer = null;
    var resizeObserver = null;
    var generation = 0;
    var frame = 0;
    var layoutFrame = 0;
    var scrollTimer = null;
    var nativeScrollEnd = 'onscrollend' in window;
    var disposed = false;
    var initialized = false;
    var readerIntent = false;
    var restorePass = !!window.location.hash || window.scrollY > 0;
    var state = { root: root, dispose: dispose };
    contentHubRevealRuntime = state;

    function active() { return !disposed && root.isConnected && contentHubRevealRuntime === state; }
    function topInset() {
      var header = document.querySelector('.md-header');
      return header ? Math.max(0, header.getBoundingClientRect().bottom) : 0;
    }
    function partsFor(element, base) {
      var paragraph = 0;
      return Array.prototype.filter.call(element.children, function (child) {
        return child.matches('h1, h2, h3, p');
      }).map(function (child) {
        var key = base + (/^H[1-6]$/.test(child.tagName) ? ':heading' : ':paragraph-' + paragraph++);
        return { element: child, key: route + ':' + key, keys: [route + ':' + key] };
      });
    }
    var initialBounds = readableBounds(null, topInset());
    var usableHeight = Math.max(1, initialBounds.bottom - initialBounds.top);
    root.querySelectorAll('[data-hub-reveal]').forEach(function (element) {
      var base = element.getAttribute('data-hub-reveal');
      var parts = partsFor(element, base);
      var card = element.classList.contains('landing-route');
      if (parts.length && (element.matches('.landing-intro, .landing-reading-entry') ||
        card && (element.getBoundingClientRect().height > usableHeight || parts.some(function (part) {
          return contentHubRevealedBlocks.has(part.key);
        })))) {
        records.push.apply(records, parts);
      } else {
        var key = route + ':' + base;
        // Stable part keys bridge whole-card and short-viewport text modes.
        records.push({ element: element, key: key,
          keys: card && parts.length ? parts.map(function (part) { return part.key; }) : [key] });
      }
    });
    if (desktop.matches) {
      var sectionNav = document.querySelector('.md-sidebar--primary .edwinos-drawer-section-nav');
      if (sectionNav) sectionNav.querySelectorAll('.md-nav__item > .md-nav__container, .md-nav__item > a.md-nav__link, .md-nav__item > label.md-nav__link').forEach(function (element) {
        var box = element.getBoundingClientRect();
        // Material leaves mobile disclosure attributes on desktop section
        // groups that CSS displays expanded. Use the rendered state instead;
        // real collapsed descendants have hidden/collapse visibility.
        if (!box.width || !box.height || window.getComputedStyle(element).visibility !== 'visible') return;
        var link = element.matches('a[href]') ? element : element.querySelector('a[href]');
        var identity = link ? link.getAttribute('href') : element.getAttribute('for') || element.textContent.trim();
        var key = route + ':sidebar:' + identity;
        records.push({ element: element, key: key, keys: [key], sidebar: true });
      });
    }
    var pending = new Set(records.filter(function (record) {
      return !record.keys.every(function (key) { return contentHubRevealedBlocks.has(key); });
    }));
    records.forEach(function (record) {
      record.trigger = record.element;
      record.element.classList.add('is-hub-reveal-unit');
      record.element.classList.toggle('is-hub-reveal-pending', pending.has(record));
    });
    // Replace the pre-paint gate with individual pending units in one task.
    // Split headings/paragraphs stay transparent without hiding their parent.
    root.setAttribute('data-hub-reveal-ready', '');

    function releaseQueued(record) {
      var entry = queued.get(record);
      if (!entry) return;
      window.clearTimeout(entry.timer);
      queued.delete(record);
    }
    function cancelAnimations() {
      Array.from(queued.keys()).forEach(releaseQueued);
      animations.forEach(function (animation) { animation.cancel(); });
      animations.clear();
    }
    function removeEndMarker(record) {
      if (record.endMarker) record.endMarker.remove();
      record.endMarker = null;
      record.trigger = record.element;
    }
    function prepareTrigger(record, inset) {
      var box = record.element.getBoundingClientRect();
      var bounds = readableBounds(record, inset);
      if (box.height <= Math.max(1, bounds.bottom - bounds.top)) {
        removeEndMarker(record);
      } else if (!record.endMarker) {
        // An unusually tall paragraph must not wait forever for ratio one.
        // Its last line is a separate observation point: seeing its beginning
        // cannot consume the as-yet unseen tail. This zero-net-width decoration
        // leaves text, selection and document geometry intact.
        var marker = document.createElement('span');
        marker.setAttribute('aria-hidden', 'true');
        marker.setAttribute('data-hub-reveal-end', '');
        marker.style.cssText = 'display:inline-block;width:1px;height:1px;margin-left:-1px;vertical-align:bottom;pointer-events:none';
        var host = record.element;
        if (host.classList.contains('landing-route')) {
          host = Array.prototype.filter.call(host.children, function (child) { return child.matches('p, h3'); }).pop() || host;
        }
        host.appendChild(marker);
        record.endMarker = marker;
        record.trigger = marker;
      }
    }
    function readableBounds(record, inset) {
      var left = 0;
      var right = window.innerWidth;
      var bottom = window.innerHeight;
      var viewport = window.visualViewport;
      if (viewport) {
        inset = Math.max(inset, viewport.offsetTop);
        left = Math.max(left, viewport.offsetLeft);
        right = Math.min(right, viewport.offsetLeft + viewport.width);
        bottom = Math.min(bottom, viewport.offsetTop + viewport.height);
      }
      if (record && record.sidebar) {
        var scrollwrap = record.element.closest('.md-sidebar__scrollwrap');
        if (scrollwrap) {
          var clip = scrollwrap.getBoundingClientRect();
          inset = Math.max(inset, clip.top);
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
          bottom = Math.min(bottom, clip.bottom);
        }
      }
      return { top: inset, bottom: bottom, left: left, right: right };
    }
    function fullyExposed(record, inset) {
      var box = record.element.getBoundingClientRect();
      if (document.hidden || !box.width || !box.height ||
        window.getComputedStyle(record.element).visibility !== 'visible') return false;
      var bounds = readableBounds(record, inset);
      if (box.left < bounds.left - 1 || box.right > bounds.right + 1) return false;
      if (record.endMarker) {
        var end = record.endMarker.getBoundingClientRect();
        return end.top >= bounds.top && end.bottom <= bounds.bottom && box.bottom <= bounds.bottom + 1;
      }
      return box.top >= bounds.top && box.bottom <= bounds.bottom;
    }
    function reveal(record, animate, delay) {
      if (!active() || !pending.has(record)) return;
      if (animate) {
        if (!fullyExposed(record, topInset())) return;
        if (delay > 0 && typeof record.element.animate === 'function') {
          if (queued.has(record)) return;
          var entry = { timer: 0 };
          // Delay only this currently visible batch. No viewed key is consumed
          // until a live viewport check at its actual start. Pending opacity
          // already keeps the unit blank, including before it enters view.
          entry.timer = window.setTimeout(function () {
            releaseQueued(record);
            if (active() && pending.has(record)) reveal(record, true, 0);
          }, delay);
          queued.set(record, entry);
          return;
        }
      }
      releaseQueued(record);
      pending.delete(record);
      record.element.classList.remove('is-hub-reveal-pending');
      record.keys.forEach(function (key) { contentHubRevealedBlocks.add(key); });
      if (observer) {
        observer.unobserve(record.trigger);
        if (record.trigger !== record.element) observer.unobserve(record.element);
      }
      removeEndMarker(record);
      if (animate && typeof record.element.animate === 'function') {
        var animation = record.element.animate([
          { opacity: 0, translate: '0 16px' },
          { opacity: 1, translate: '0 0' }
        ], { duration: 800, delay: 0, fill: 'backwards', easing: 'cubic-bezier(.2,.7,.3,1)' });
        animations.set(record.element, animation);
        animation.onfinish = animation.oncancel = function () {
          animations.delete(record.element);
          finishIfComplete();
        };
      }
      if (!pending.size && observer) { observer.disconnect(); observer = null; }
      finishIfComplete();
    }
    function finishIfComplete() { if (!pending.size && !animations.size) dispose(); }
    function revealBatch(candidates) {
      [false, true].forEach(function (sidebar) {
        var batch = records.filter(function (record) {
          return !!record.sidebar === sidebar && pending.has(record) && !queued.has(record) && candidates.has(record);
        });
        var spacing = Math.min(80, (sidebar ? 600 : 480) / Math.max(1, batch.length - 1));
        batch.forEach(function (record, index) { reveal(record, true, index * spacing); });
      });
    }
    function showAll() {
      cancelAnimations();
      Array.from(pending).forEach(function (record) { reveal(record, false); });
    }
    function exposeViewport() {
      var inset = topInset();
      Array.from(pending).forEach(function (record) {
        var box = record.element.getBoundingClientRect();
        var bounds = readableBounds(record, inset);
        // A restored/fragment viewport exposes its current reading position,
        // not the entire route. Bottom-clipped paragraphs remain eligible.
        if (box.bottom <= bounds.top || fullyExposed(record, inset) ||
          box.top < bounds.top && box.bottom <= bounds.bottom) reveal(record, false);
      });
    }
    function exposeTarget(target) {
      var index = records.findIndex(function (record) { return record.element.contains(target); });
      // Focusing header/search/drawer controls must not consume article units.
      if (index < 0) return;
      cancelAnimations();
      if (index >= 0) records.slice(0, index + 1).forEach(function (record) {
        if (!!record.sidebar === !!records[index].sidebar) reveal(record, false);
      });
      exposeViewport();
    }
    function onHash() {
      var id;
      try { id = decodeURIComponent(window.location.hash.slice(1)); } catch (_) { return; }
      var target = id && document.getElementById(id);
      if (target) { restorePass = true; exposeTarget(target); scheduleLayout(); }
    }
    function onFocus(event) { exposeTarget(event.target); }
    function onReaderIntent(event) {
      if (event.type === 'keydown' && !/^(ArrowDown|ArrowUp|PageDown|PageUp|Home|End| |Spacebar)$/.test(event.key)) return;
      if (event.type === 'keydown' && event.target.closest &&
        event.target.closest('input, textarea, select, [contenteditable]')) return;
      readerIntent = true;
      // Wheel/touch events continue throughout a smooth reading gesture.
      // Keep started entrances running and queued units unread: their timers
      // already check live bounds before starting, including during scrolling.
    }
    function onScroll() {
      // Only startup restoration is special. Native scrollbar drags and
      // programmatic reader scrolling must not flush the unread queue.
      if (!initialized && !readerIntent) restorePass = true;
      if (!nativeScrollEnd) {
        window.clearTimeout(scrollTimer);
        scrollTimer = window.setTimeout(onScrollEnd, 120);
      }
    }
    function onScrollEnd() {
      scrollTimer = null;
      if (!active() || !initialized) return;
      var inset = topInset();
      var candidates = new Set();
      Array.from(pending).forEach(function (record) {
        var box = record.element.getBoundingClientRect();
        var bounds = readableBounds(record, inset);
        if (box.bottom <= bounds.top) reveal(record, false);
        else if (fullyExposed(record, inset)) candidates.add(record);
        else if (box.top < bounds.top && box.bottom <= bounds.bottom) reveal(record, false);
      });
      revealBatch(candidates);
    }
    function onPageShow(event) {
      if (event.persisted || window.scrollY > 0) {
        restorePass = true;
        cancelAnimations();
        if (initialized) { exposeViewport(); scheduleLayout(); }
      }
    }
    function onMotionChange() { if (motion.matches) showAll(); }
    function onVisibilityChange() {
      if (document.hidden) cancelAnimations();
      else scheduleLayout();
    }
    function onDesktopChange() {
      if (!desktop.matches) records.forEach(function (record) {
        if (!record.sidebar) return;
        var animation = animations.get(record.element);
        if (animation) animation.cancel();
        reveal(record, false);
      });
      scheduleLayout();
    }
    function scheduleLayout() {
      if (!active() || !initialized || layoutFrame) return;
      layoutFrame = window.requestAnimationFrame(function () {
        layoutFrame = 0;
        if (active()) observePending();
      });
    }
    function observePending() {
      if (!active() || !pending.size) return;
      if (observer) observer.disconnect();
      var currentGeneration = ++generation;
      var inset = topInset();
      Array.from(pending).forEach(function (record) { prepareTrigger(record, inset); });
      if (restorePass) { exposeViewport(); restorePass = false; }
      if (!active() || !pending.size) return;
      observer = new window.IntersectionObserver(function (entries) {
        if (!active() || currentGeneration !== generation) return;
        var top = topInset();
        var candidates = new Set();
        entries.forEach(function (entry) {
          records.forEach(function (record) {
            if (!pending.has(record) || (entry.target !== record.trigger && entry.target !== record.element)) return;
            var box = record.element.getBoundingClientRect();
            var bounds = readableBounds(record, top);
            if (box.bottom <= bounds.top) reveal(record, false);
            else if (entry.isIntersecting && fullyExposed(record, top)) candidates.add(record);
            else if (box.top < bounds.top && box.bottom <= bounds.bottom) reveal(record, false);
          });
        });
        revealBatch(candidates);
      }, { rootMargin: '-' + Math.ceil(inset) + 'px 0px 0px', threshold: [0, 1] });
      var candidates = new Set();
      Array.from(pending).forEach(function (record) {
        var box = record.element.getBoundingClientRect();
        var bounds = readableBounds(record, inset);
        if (box.bottom <= bounds.top) reveal(record, false);
        else if (fullyExposed(record, inset)) candidates.add(record);
        else if (box.top < bounds.top && box.bottom <= bounds.bottom) reveal(record, false);
        if (pending.has(record)) {
          observer.observe(record.trigger);
          if (record.trigger !== record.element) observer.observe(record.element);
        }
      });
      revealBatch(candidates);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      generation++;
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(layoutFrame);
      window.clearTimeout(scrollTimer);
      if (observer) observer.disconnect();
      if (resizeObserver) resizeObserver.disconnect();
      cancelAnimations();
      records.forEach(function (record) {
        removeEndMarker(record);
        record.element.classList.remove('is-hub-reveal-pending');
      });
      pending.clear();
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('scrollend', onScrollEnd);
      window.removeEventListener('resize', scheduleLayout);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', scheduleLayout);
        window.visualViewport.removeEventListener('scroll', scheduleLayout);
      }
      window.removeEventListener('beforeprint', showAll);
      ['wheel', 'touchmove', 'keydown'].forEach(function (name) { window.removeEventListener(name, onReaderIntent); });
      motion.removeEventListener('change', onMotionChange);
      desktop.removeEventListener('change', onDesktopChange);
    }
    if (!pending.size || motion.matches || !window.IntersectionObserver) {
      showAll();
      dispose();
      return;
    }
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('hashchange', onHash);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('scroll', onScroll, { passive: true });
    if (nativeScrollEnd) window.addEventListener('scrollend', onScrollEnd, { passive: true });
    window.addEventListener('resize', scheduleLayout, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
      window.visualViewport.addEventListener('scroll', scheduleLayout, { passive: true });
    }
    window.addEventListener('beforeprint', showAll);
    ['wheel', 'touchmove', 'keydown'].forEach(function (name) { window.addEventListener(name, onReaderIntent, { passive: true }); });
    motion.addEventListener('change', onMotionChange);
    desktop.addEventListener('change', onDesktopChange);
    if (typeof window.ResizeObserver === 'function') {
      resizeObserver = new window.ResizeObserver(scheduleLayout);
      resizeObserver.observe(root);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleLayout);
    frame = window.requestAnimationFrame(function () {
      frame = window.requestAnimationFrame(function () {
        if (!active()) return;
        initialized = true;
        restorePass = restorePass || !readerIntent && window.scrollY > 0;
        if (window.location.hash) onHash();
        observePending();
      });
    });
  }

  function setupOverviewReveal() {
    var root = document.body.classList.contains("is-homepage") &&
      document.querySelector(".academic-home-layout .academic-content");
    if (overviewRevealRuntime && overviewRevealRuntime.root === root) return;
    if (overviewRevealRuntime) overviewRevealRuntime.dispose();
    if (!root) return;
    var sections = Array.prototype.slice.call(root.querySelectorAll("[data-overview-reveal]"));
    if (!sections.length) return;
    var pending = new Set();
    // Initial top-of-page content is visible, but opening Detailed Profile can
    // push it out of view before the reader has started scrolling through it.
    var initialStatic = new Set();
    var automaticEntries = new Map();
    var headingSections = new Map();
    var sectionHeadings = new Map();
    sections.forEach(function (section) {
      var heading = Array.prototype.find.call(section.children, function (child) {
        return child.tagName === "H2" && child.classList.contains("section-title");
      });
      if (heading) {
        headingSections.set(heading, section);
        sectionHeadings.set(section, heading);
      }
    });
    var profileDetails = root.querySelector(".about-profile-details");
    var intersection = null;
    var intersectionGeneration = 0;
    var scrollTimer = null;
    var nativeScrollEnd = "onscrollend" in window;
    var motion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
    var initialScrollTop = scrollTop();
    var canDeferInitialRead = initialScrollTop === 0 && !window.location.hash;
    var readerStarted = false;
    var readingScrollIntent = false;
    var readingIntentTop = initialScrollTop;
    var traversalStarted = false;
    var disclosureInteracted = false;
    var pageShown = document.readyState === "complete";
    var restoringViewport = false;
    var disposed = false;
    var state = { root: root, dispose: dispose };
    overviewRevealRuntime = state;

    function active() {
      return !disposed && overviewRevealRuntime === state && root.isConnected;
    }
    function scrollTop() {
      return typeof window.scrollY === "number" ? window.scrollY : window.pageYOffset || 0;
    }
    function commitInitialRead() {
      initialStatic.forEach(function (section) {
        overviewRevealedSections.add(section.getAttribute("data-overview-reveal"));
      });
      initialStatic.clear();
      automaticEntries.clear();
    }
    function reveal(section, animate) {
      overviewRevealedSections.add(section.getAttribute("data-overview-reveal"));
      pending.delete(section);
      initialStatic.delete(section);
      automaticEntries.delete(section);
      if (intersection) {
        intersection.unobserve(sectionHeadings.get(section));
        intersection.unobserve(section);
      }
      // Only an actual viewport entry gets a transition; restoration and focus
      // must expose the final position without fighting the fragment owner.
      section.classList.toggle("is-overview-reveal-visible", !!animate);
      section.classList.remove("is-overview-reveal-pending");
    }
    function showInitial(section, animate) {
      pending.delete(section);
      initialStatic.add(section);
      if (intersection) {
        intersection.unobserve(sectionHeadings.get(section));
        intersection.unobserve(section);
      }
      if (animate) {
        automaticEntries.set(section, window.performance ? window.performance.now() : 0);
      } else automaticEntries.delete(section);
      section.classList.toggle("is-overview-reveal-visible", !!animate);
      section.classList.remove("is-overview-reveal-pending");
    }
    function onAutomaticEntryEnd(event) {
      if (!active() || !automaticEntries.has(event.target) ||
          !/^(?:opacity|transform)$/.test(event.propertyName) || event.pseudoElement) return;
      // Reject an already queued end event from an entrance superseded by a
      // disclosure toggle; its timestamp predates this entrance generation.
      if (event.timeStamp < automaticEntries.get(event.target)) return;
      reveal(event.target, true);
      finishIfComplete();
    }
    function headingFullyVisible(section, bottom) {
      var rect = sectionHeadings.get(section).getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= bottom;
    }
    function revealThrough(target) {
      var index = sections.findIndex(function (section) {
        return section === target || section.contains(target);
      });
      if (index < 0) return;
      sections.slice(0, index + 1).forEach(function (section) {
        if (pending.has(section) || initialStatic.has(section)) reveal(section, false);
      });
    }
    function revealHash() {
      var hash = window.location.hash.slice(1);
      if (!hash) return;
      try { hash = decodeURIComponent(hash); } catch (_) { /* Malformed hashes remain literal. */ }
      var target = document.getElementById(hash);
      if (target) revealThrough(target);
    }
    function exposeRestoredViewport() {
      var bottom = window.innerHeight || document.documentElement.clientHeight;
      var provisional = canDeferInitialRead && !readerStarted && scrollTop() === 0 && !window.location.hash;
      if (!provisional) commitInitialRead();
      pending.forEach(function (section) {
        // Read only marked section boundaries on setup/restoration, never on
        // scroll frames. Past content stays visible even after a rapid jump.
        if (provisional) {
          if (headingFullyVisible(section, bottom)) showInitial(section);
        } else if (section.getBoundingClientRect().top < bottom) reveal(section, false);
      });
    }
    function finishIfComplete() {
      if (!pending.size && !initialStatic.size) dispose();
    }
    function onHash() {
      if (!active()) return;
      readerStarted = true;
      readingScrollIntent = false;
      revealHash();
      finishIfComplete();
    }
    function onFocus(event) {
      if (!active()) return;
      readerStarted = true;
      readingScrollIntent = false;
      revealThrough(event.target);
      finishIfComplete();
    }
    function showRemaining() {
      pending.forEach(function (section) { reveal(section, false); });
      initialStatic.forEach(function (section) { reveal(section, false); });
      finishIfComplete();
    }
    function onPageShow(event) {
      if (!active()) return;
      pageShown = true;
      if (traversalStarted) removeReadingIntent();
      if (event.persisted) showRemaining();
      else if (!readerStarted) {
        revealHash();
        exposeRestoredViewport();
        finishIfComplete();
      }
    }
    function onMotionChange() {
      if (active() && motion.matches) showRemaining();
    }
    function onFirstDownScroll() {
      if (!active() || !readingScrollIntent || scrollTop() <= readingIntentTop) return;
      traversalStarted = true;
      readerStarted = true;
      // No geometry/style work on scroll: only record the initial, still-visible
      // columns as read, then retire this listener after the first downward move.
      commitInitialRead();
      window.removeEventListener("scroll", onFirstDownScroll);
      if (readerStarted) removeReadingIntent();
      finishIfComplete();
    }
    function onReadingIntent(event) {
      if (!active()) return;
      if (event.type === "keydown" &&
          !/^(?:ArrowDown|ArrowUp|PageDown|PageUp|Home|End| |Spacebar)$/.test(event.key)) return;
      if (event.type === "keydown" && event.target && event.target.closest) {
        if (event.target.closest("input, textarea, select, [contenteditable]") ||
            /^(?: |Spacebar)$/.test(event.key) && event.target.closest("summary, button")) {
          readingScrollIntent = false;
          return;
        }
      }
      readerStarted = true;
      readingScrollIntent = true;
      readingIntentTop = scrollTop();
    }
    function removeReadingIntent() {
      ["wheel", "touchmove", "keydown"].forEach(function (event) {
        window.removeEventListener(event, onReadingIntent);
      });
    }
    function onProfileToggle() {
      if (!active()) return;
      disclosureInteracted = true;
      readerStarted = true;
      readingScrollIntent = false;
      if (profileDetails.open) {
        var bottom = window.innerHeight || document.documentElement.clientHeight;
        initialStatic.forEach(function (section) {
          if (headingFullyVisible(section, bottom)) return;
          initialStatic.delete(section);
          automaticEntries.delete(section);
          pending.add(section);
          section.classList.remove("is-overview-reveal-visible");
          section.classList.add("is-overview-reveal-pending");
        });
      } else if (canDeferInitialRead && !traversalStarted) {
        var viewportBottom = window.innerHeight || document.documentElement.clientHeight;
        pending.forEach(function (section) {
          // Closing before any traversal restores the original static preview.
          // Reopening can still re-arm it; committed keys never return here.
          if (headingFullyVisible(section, viewportBottom)) showInitial(section);
        });
      }
      // Old queued intersections describe the pre-toggle layout. Replace their
      // generation once per toggle, never on scroll or animation frames.
      restartIntersection();
      finishIfComplete();
    }
    function onScrollEnd() {
      scrollTimer = null;
      if (!active()) return;
      // A jump can skip a whole section with IO remaining false -> false.
      // Reconcile once after scrolling settles, rather than measuring frames.
      pending.forEach(function (section) {
        // Leave a currently visible column to IO: scrollend can arrive before
        // its intersection callback and must not steal the entrance animation.
        if (sectionHeadings.get(section).getBoundingClientRect().bottom <= 0) reveal(section, false);
      });
      // Dragging the native scrollbar need not emit a wheel/touch/key intent.
      // Only wholly passed provisional content can be committed by this path.
      initialStatic.forEach(function (section) {
        if (section.getBoundingClientRect().bottom <= 0) reveal(section, false);
      });
      finishIfComplete();
    }
    function onScrollFallback() {
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(onScrollEnd, 120);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      intersectionGeneration++;
      if (intersection) intersection.disconnect();
      intersection = null;
      if (scrollTimer !== null) window.clearTimeout(scrollTimer);
      scrollTimer = null;
      pending.forEach(function (section) { section.classList.remove("is-overview-reveal-pending"); });
      pending.clear();
      // Leaving visible initial content counts as a completed visit, preserving
      // the existing no-replay contract when Material returns to Overview.
      commitInitialRead();
      if (profileDetails) profileDetails.removeEventListener("toggle", onProfileToggle);
      root.removeEventListener("transitionend", onAutomaticEntryEnd);
      document.removeEventListener("focusin", onFocus, true);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("scroll", onFirstDownScroll);
      removeReadingIntent();
      window.removeEventListener(nativeScrollEnd ? "scrollend" : "scroll", nativeScrollEnd ? onScrollEnd : onScrollFallback);
      if (motion && motion.removeEventListener) motion.removeEventListener("change", onMotionChange);
      else if (motion && motion.removeListener) motion.removeListener(onMotionChange);
      // Release outgoing nodes but retain stable, already-read section keys.
      sections.length = 0;
      headingSections.clear();
      sectionHeadings.clear();
      if (overviewRevealRuntime === state) overviewRevealRuntime = null;
    }
    function restartIntersection() {
      var generation = ++intersectionGeneration;
      if (intersection) intersection.disconnect();
      intersection = null;
      if (!pending.size) return;
      intersection = new window.IntersectionObserver(function (entries) {
        if (!active() || generation !== intersectionGeneration) return;
        var restorationCandidate = !traversalStarted && !readingScrollIntent &&
          !disclosureInteracted && scrollTop() > 0;
        // A late native restoration can skip the entire short heading while
        // landing inside a long section's body (false -> false for its title).
        // Body records recover that landing, never ordinary bottom entrances.
        entries.forEach(function (entry) {
          var section = entry.target;
          if (!sectionHeadings.has(section) || !entry.isIntersecting ||
              entry.boundingClientRect.top >= 0 || entry.boundingClientRect.bottom <= 0 ||
              !(pending.has(section) || automaticEntries.has(section))) return;
          if (restorationCandidate && !restoringViewport) {
            restoringViewport = true;
            automaticEntries.forEach(function (_, automaticSection) { reveal(automaticSection, false); });
            // One bounded restoration correction also exposes any partial title
            // at the viewport bottom; it does not run on scroll frames.
            exposeRestoredViewport();
          }
          if (pending.has(section) || automaticEntries.has(section)) {
            if (canDeferInitialRead && !traversalStarted && !restoringViewport) showInitial(section, false);
            else reveal(section, false);
          }
        });
        entries.forEach(function (entry) {
          var section = headingSections.get(entry.target);
          if (!pending.has(section)) return;
          var restoring = restorationCandidate && (!pageShown || restoringViewport);
          var automatic = !traversalStarted && !restoring;
          if (entry.isIntersecting && entry.intersectionRatio >= 1) {
            // Focus/assistive positioning can briefly expose a title before a
            // disclosure expands. Confirm only after its entrance finishes or
            // actual reading traversal; until then it can still be re-armed.
            if (automatic) { showInitial(section, true); return; }
            var index = sections.indexOf(section);
            sections.slice(0, index).forEach(function (section) {
              if (pending.has(section) || initialStatic.has(section)) reveal(section, false);
            });
            reveal(section, !restoring);
          }
          else if (entry.boundingClientRect.bottom <= 0) {
            if (automatic) showInitial(section, false);
            else reveal(section, false);
          }
        });
        finishIfComplete();
      }, { threshold: [0, 1], rootMargin: "0px 0px -30px 0px" });
      pending.forEach(function (section) {
        intersection.observe(sectionHeadings.get(section));
        intersection.observe(section);
      });
    }

    sections.forEach(function (section) {
      section.classList.remove("is-overview-reveal-visible", "is-overview-reveal-pending");
      if (!sectionHeadings.has(section)) reveal(section, false);
      else if (!overviewRevealedSections.has(section.getAttribute("data-overview-reveal"))) pending.add(section);
    });
    if (!window.IntersectionObserver || (motion && motion.matches)) {
      showRemaining();
      return;
    }
    revealHash();
    exposeRestoredViewport();
    if (!pending.size && !initialStatic.size) { dispose(); return; }
    pending.forEach(function (section) { section.classList.add("is-overview-reveal-pending"); });
    restartIntersection();
    if (profileDetails) profileDetails.addEventListener("toggle", onProfileToggle);
    root.addEventListener("transitionend", onAutomaticEntryEnd);
    document.addEventListener("focusin", onFocus, true);
    window.addEventListener("hashchange", onHash);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("scroll", onFirstDownScroll, { passive: true });
    ["wheel", "touchmove", "keydown"].forEach(function (event) {
      window.addEventListener(event, onReadingIntent, { passive: true });
    });
    window.addEventListener(nativeScrollEnd ? "scrollend" : "scroll", nativeScrollEnd ? onScrollEnd : onScrollFallback, { passive: true });
    if (motion && motion.addEventListener) motion.addEventListener("change", onMotionChange);
    else if (motion && motion.addListener) motion.addListener(onMotionChange);
  }

  // Reading desk: content remains readable without JS; only offscreen items
  // enter once. Only the selected clip warms metadata; Save-Data waits for intent.
  function setupBlogHome() {
    var root = document.querySelector('.blog-home');
    if (blogHomeRuntime && blogHomeRuntime.root === root) return;
    if (blogHomeRuntime) blogHomeRuntime.dispose();
    blogHomeRuntime = null;
    if (!root) return;
    var localizedLabels = [];
    document.querySelectorAll('.md-header [title], .md-header [aria-label]').forEach(function (element) {
      ['title', 'aria-label'].forEach(function (attribute) {
        var original = element.getAttribute(attribute);
        var english = { '切换至深色模式': 'Switch to dark mode', '切换至浅色模式': 'Switch to light mode' }[original];
        if (english) { localizedLabels.push([element, attribute, original]); element.setAttribute(attribute, english); }
      });
    });
    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var observer = null, mediaObserver = null, disposed = false;
    var animations = new Set(), pending = new Set();
    var video = root.querySelector('[data-blog-home-video]');
    var play = root.querySelector('[data-blog-home-play]');
    var media = root.querySelector('.blog-home-feature');
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    var saveData = !!(navigator.connection && navigator.connection.saveData);
    var playGeneration = 0;
    var clips = Array.from(root.querySelectorAll('[data-blog-home-clip]'));
    var clipGroup = root.querySelector('.blog-home-clips');
    var caption = root.querySelector('[data-blog-home-caption]');
    var speed = root.querySelector('[data-blog-home-speed]');
    // Authored data-src avoids parser downloads before the Save-Data guard.
    if (video) {
      video.preload = saveData ? 'none' : 'metadata';
      if (!saveData && !video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
    }
    function selectClip(event) {
      var button = event.currentTarget;
      if (!video || button.getAttribute('aria-pressed') === 'true') return;
      pauseVideo();
      video.removeAttribute('src'); video.load();
      video.dataset.src = button.dataset.src;
      video.poster = button.dataset.poster;
      video.setAttribute('aria-label', button.dataset.caption + ', ' + button.dataset.speed);
      caption.textContent = button.dataset.caption; speed.textContent = button.dataset.speed;
      clips.forEach(function (clip) { clip.setAttribute('aria-pressed', clip === button ? 'true' : 'false'); });
      // Switching is explicit playback intent; no inactive clip is warmed.
      startVideo();
    }
    function show(element, animate) {
      pending.delete(element);
      element.style.removeProperty('opacity');
      if (observer) observer.unobserve(element);
      if (animate && !motion.matches && element.animate) {
        var effect = element.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.2,.7,.3,1)' });
        animations.add(effect);
        effect.onfinish = function () { animations.delete(effect); };
      }
    }
    if ('IntersectionObserver' in window && !motion.matches) {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && pending.has(entry.target)) show(entry.target, true);
        });
      }, { threshold: .12 });
      root.querySelectorAll('[data-blog-home-reveal]').forEach(function (element) {
        var rect = element.getBoundingClientRect();
        if (rect.top >= window.innerHeight && !element.contains(document.activeElement)) {
          element.style.opacity = '0'; pending.add(element); observer.observe(element);
        }
      });
    }
    function focus(event) {
      pending.forEach(function (element) { if (element.contains(event.target)) show(element, false); });
    }
    function label() {
      if (!play || !video) return;
      play.textContent = video.paused ? (finePointer.matches && !motion.matches && !saveData ? 'Hover to play' : 'Play preview') : 'Pause preview';
      play.setAttribute('aria-label', video.paused ? 'Play robot preview' : 'Pause robot preview');
      play.setAttribute('aria-pressed', video.paused ? 'false' : 'true');
    }
    function startVideo() {
      if (!video || !play) return;
      var generation = ++playGeneration;
      if (!video.getAttribute('src') && video.dataset.src) video.src = video.dataset.src;
      var result = video.play();
      if (result && result.catch) result.catch(function (error) {
        if (disposed || generation !== playGeneration || error.name === 'AbortError') return;
        play.textContent = 'Retry preview'; play.setAttribute('aria-label', 'Retry robot preview');
      });
    }
    function pauseVideo() { playGeneration += 1; if (video) video.pause(); }
    function toggleVideo() { if (video && !video.paused) pauseVideo(); else startVideo(); }
    function enterVideo(event) {
      if (event.pointerType !== 'touch' && finePointer.matches && !motion.matches && !saveData) startVideo();
    }
    function visibility() { if (document.hidden) pauseVideo(); }
    function reduceMotion() {
      if (!motion.matches) return;
      pending.forEach(function (element) { show(element, false); });
      animations.forEach(function (animation) { animation.finish(); });
      if (video) video.pause();
    }
    root.addEventListener('focusin', focus);
    if (play && video) {
      play.addEventListener('click', toggleVideo);
      media.addEventListener('pointerenter', enterVideo);
      media.addEventListener('pointerleave', pauseVideo);
      video.addEventListener('play', label); video.addEventListener('pause', label);
      document.addEventListener('visibilitychange', visibility);
      if ('IntersectionObserver' in window) {
        mediaObserver = new IntersectionObserver(function (entries) {
          if (entries.some(function (entry) { return !entry.isIntersecting; })) pauseVideo();
        });
        mediaObserver.observe(video);
      }
      if (clipGroup) clipGroup.hidden = false;
      clips.forEach(function (clip) { clip.addEventListener('click', selectClip); });
      label();
    }
    motion.addEventListener('change', reduceMotion);
    blogHomeRuntime = { root: root, dispose: function () {
      disposed = true;
      localizedLabels.forEach(function (item) { item[0].setAttribute(item[1], item[2]); });
      if (observer) observer.disconnect(); if (mediaObserver) mediaObserver.disconnect();
      pending.forEach(function (element) { show(element, false); });
      animations.forEach(function (animation) { animation.cancel(); });
      root.removeEventListener('focusin', focus);
      motion.removeEventListener('change', reduceMotion);
      document.removeEventListener('visibilitychange', visibility);
      clips.forEach(function (clip) { clip.removeEventListener('click', selectClip); });
      if (play) play.removeEventListener('click', toggleVideo);
      if (media) { media.removeEventListener('pointerenter', enterVideo); media.removeEventListener('pointerleave', pauseVideo); }
      if (video) { video.pause(); video.removeEventListener('play', label); video.removeEventListener('pause', label); }
    } };
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
    setupOverviewReveal();
    setupBlogHome();
    ensureHeaderGlass();
    ensureTocGlass();
    setupHeaderSearchTransition();
    setupTabGlass();
    normalizePaletteButtons();
    normalizeSourceFacts();
    if (!latestSourceFacts) restoreStoredSourceFacts();
    applySourceFacts();
    watchSourceFacts();
    updateBeijingTime();
    setupSearchActivation();
    setupSearchResultSummary();
    markProfileDrawerEntries();
    setSectionNavigationDepth();
    setupDrawerGlass();
    restorePrimarySidebarScroll();
    setupContentHubReveal();
    window.clearTimeout(window.__edwinosHubRevealBootTimer);
    openExternalContentLinksInNewTabs();
    labelCodeBlockLanguages();
    setupContentGlass();
    setupCollapsibleCallouts();
    setupAuthorToggles();
    setupPublicationPreviews();
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
