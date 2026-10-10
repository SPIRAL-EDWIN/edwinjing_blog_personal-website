/** Search intent bridge. Material keeps its normal SETUP/READY/query protocol. */
(function () {
  "use strict";
  // A refreshed document starts with empty search memory. Remove search-input
  // URL state before Material can open/focus it; destination highlights stay.
  var navigation = window.performance && window.performance.getEntriesByType
    ? window.performance.getEntriesByType("navigation")[0] : null;
  if (navigation && navigation.type === "reload") {
    var refreshedURL = new URL(window.location.href);
    if (refreshedURL.searchParams.has("q") || refreshedURL.searchParams.has("query")) {
      refreshedURL.searchParams.delete("q");
      refreshedURL.searchParams.delete("query");
      window.history.replaceState(window.history.state, "", refreshedURL.href);
    }
  }
  var node = document.getElementById("__config");
  if (!node || !window.Worker) return;
  var workerURL;
  try { workerURL = new URL(JSON.parse(node.textContent).search, document.baseURI).href; }
  catch (error) { return; }
  var NativeWorker = window.Worker;
  var worker = null;
  var requested = false;
  var ready = false;
  var failed = false;
  var lastStart = 0;
  var warmTimer = 0;
  var idleTask = 0;

  function status(text) {
    var meta = document.querySelector(".md-search-result__meta");
    if (meta) meta.textContent = text;
  }

  function start() {
    if (ready) return;
    var now = Date.now();
    if (failed && now - lastStart < 1000) return;
    requested = true;
    if (worker && (!lastStart || failed)) {
      failed = false;
      lastStart = now;
      status("正在加载搜索…");
      worker.postMessage({ type: 4 });
    }
    window.clearTimeout(warmTimer);
    if (idleTask && window.cancelIdleCallback) window.cancelIdleCallback(idleTask);
  }

  // Capture only our worker, then immediately restore the native constructor.
  // No network interception or change to other workers is needed.
  function SearchWorker(url, options) {
    var instance = new NativeWorker(url, options);
    if (new URL(url, document.baseURI).href === workerURL) {
      worker = instance;
      if (window.Worker === SearchWorker) window.Worker = NativeWorker;
      instance.addEventListener("message", function (event) {
        if (event.data.type === 1) {
          ready = true;
          status("键入以开始搜索");
        } else if (event.data.type === 5 && event.data.data.status === "error") {
          failed = true;
          status("搜索加载失败，再次输入可重试");
        }
      });
      if (requested) start();
    }
    return instance;
  }
  SearchWorker.prototype = NativeWorker.prototype;
  Object.setPrototypeOf(SearchWorker, NativeWorker);
  window.Worker = SearchWorker;

  function intent(event) {
    var target = event.target;
    if (target && target.closest && target.closest('.md-search, [for="__search"]')) start();
  }
  document.addEventListener("pointerdown", intent, true);
  document.addEventListener("focusin", intent, true);
  document.addEventListener("input", intent, true);
  document.addEventListener("keydown", function (event) {
    intent(event);
    var target = event.target;
    var editing = target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
    if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey &&
        (event.key === "s" || event.key === "/")) start();
  }, true);
  function deepQuery() {
    var params = new URL(window.location.href).searchParams;
    // Highlight-only visits need just the small manifest, not the corpus.
    if (params.get("q") || params.get("query")) start();
  }
  window.addEventListener("popstate", deepQuery);
  deepQuery();
  function warmAfterPaint() {
    var connection = window.navigator.connection;
    if (connection && (connection.saveData || /(^|-)2g$/.test(connection.effectiveType || ""))) return;
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        warmTimer = window.setTimeout(function () {
          if (requested || ready) return;
          if (window.requestIdleCallback) idleTask = window.requestIdleCallback(start, { timeout: 3000 });
          else start();
        }, 2000);
      });
    });
  }
  if (document.readyState === "complete") warmAfterPaint();
  else window.addEventListener("load", warmAfterPaint, { once: true });
})();
