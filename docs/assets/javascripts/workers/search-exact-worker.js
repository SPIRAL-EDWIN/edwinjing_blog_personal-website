/* EdwinOS owns retrieval; Material owns the UI and message protocol. */
(function () {
  "use strict";
  var revision = new URL(self.location.href).searchParams.get("v") || "20261009f";
  var setup;
  var engine;
  var requested = false;
  var loading;
  var librariesLoaded = false;
  var attempts = 0;
  var pendingQuery = null;

  function query(value) {
    try {
      self.postMessage({ type: 3, data: engine.search(value) });
    } catch (error) {
      console.error("EdwinOS search failed", error);
      self.postMessage({ type: 3, data: { items: [] } });
    }
  }

  function start() {
    if (!setup || !requested || loading || engine) return;
    attempts++;
    loading = Promise.resolve().then(function () {
      var dataPromise = Promise.resolve(setup);
      if (setup.config && setup.config.edwinos_corpus) {
        var url = new URL(setup.config.edwinos_corpus, self.location.href);
        if (url.origin !== self.location.origin) throw new Error("Search corpus must be same-origin");
        // Start the larger transfer before synchronous worker script imports.
        dataPromise = fetch(url.href, { cache: attempts > 1 ? "reload" : "force-cache" }).then(function (response) {
          if (!response.ok) throw new Error("Search corpus HTTP " + response.status);
          return response.json();
        });
      }
      var librariesPromise = Promise.resolve().then(function () {
        if (!librariesLoaded) {
          importScripts("vendor/lunr.min.js", "search-engine.js?v=" + encodeURIComponent(revision));
          librariesLoaded = true;
        }
      });
      // Attach both rejection handlers before importing libraries so a failed
      // script and a concurrent failed fetch cannot leave an unhandled promise.
      return Promise.all([dataPromise, librariesPromise]).then(function (values) { return values[0]; });
    }).then(function (data) {
      if (!Array.isArray(data.docs)) throw new Error("Invalid search corpus");
      engine = EdwinSearch.createEngine(data.docs, lunr, data.config && data.config.edwinos_index);
      self.postMessage({ type: 1 });
      if (pendingQuery !== null) {
        query(pendingQuery);
        pendingQuery = null;
      }
    }).catch(function (error) {
      console.error("EdwinOS search initialization failed", error);
      self.postMessage({ type: 5, data: { status: "error", message: String(error.message || error) } });
    }).then(function () {
      loading = undefined;
    });
  }

  self.addEventListener("message", function (event) {
    var message = event.data || {};
    if (message.type === 0) {
      setup = message.data || {};
      // Older full SETUP payloads preserve their eager initialization contract.
      if (!setup.config || !setup.config.edwinos_corpus) requested = true;
      start();
    } else if (message.type === 4) {
      requested = true;
      start();
    } else if (message.type === 2) {
      var value = String(message.data || "");
      if (engine) query(value);
      else {
        pendingQuery = value;
        requested = true;
        start();
      }
    }
  });
})();
