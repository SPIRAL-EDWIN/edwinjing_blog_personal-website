/* EdwinOS owns retrieval; Material owns the UI and message protocol. */
(function () {
  "use strict";
var revision = new URL(self.location.href).searchParams.get("v") || "20261009e";
  importScripts("vendor/lunr.min.js", "search-engine.js?v=" + encodeURIComponent(revision));
  var engine;
  self.addEventListener("message", function (event) {
    var message = event.data || {};
    if (message.type === 0) {
      var data = message.data || {};
      engine = EdwinSearch.createEngine(data.docs || [], lunr, data.config && data.config.edwinos_index);
      self.postMessage({ type: 1 });
    } else if (message.type === 2) {
      try {
        self.postMessage({ type: 3, data: engine.search(String(message.data || "")) });
      } catch (error) {
        console.error("EdwinOS search failed", error);
        self.postMessage({ type: 3, data: { items: [] } });
      }
    }
  });
})();
