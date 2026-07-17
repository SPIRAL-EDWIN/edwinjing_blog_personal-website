(function () {
  "use strict";

  var workerUrl = new URL(self.location.href);
  var upstreamValue = workerUrl.searchParams.get("upstream");
  if (!upstreamValue) throw new Error("Missing upstream search worker URL");

  var upstreamUrl = new URL(upstreamValue, workerUrl);
  if (upstreamUrl.origin !== workerUrl.origin || upstreamUrl.pathname === workerUrl.pathname) {
    throw new Error("Invalid upstream search worker URL");
  }

  var nativePostMessage = self.postMessage.bind(self);
  var documents = [];
  var exactMatchCache = new Map();
  var pendingFilters = [];

  function normalizeIndexText(value) {
    return String(value || "").replace(/\u200b/g, "").normalize("NFC");
  }

  function exactHanTerms(value) {
    var query = String(value || "").trim().normalize("NFC");
    return /^\p{Script=Han}{2,}$/u.test(query) && Array.from(query).length >= 2
      ? [query]
      : [];
  }

  function prepareDocuments(rawDocuments) {
    documents = (rawDocuments || []).map(function (document) {
      return {
        location: document.location,
        text: normalizeIndexText([
          document.title,
          document.text,
          Array.isArray(document.tags) ? document.tags.join(" ") : ""
        ].join(" "))
      };
    });
    exactMatchCache.clear();
  }

  function exactLocationsForQuery(query) {
    if (exactMatchCache.has(query)) return exactMatchCache.get(query);

    var terms = exactHanTerms(query);
    if (!terms.length) {
      exactMatchCache.set(query, null);
      return null;
    }

    var locations = new Set();
    documents.forEach(function (document) {
      if (terms.every(function (term) { return document.text.indexOf(term) !== -1; })) {
        locations.add(document.location);
      }
    });

    var result = locations.size ? locations : null;
    exactMatchCache.set(query, result);
    return result;
  }

  function filterResult(message, exactLocations) {
    if (!exactLocations || !message || message.type !== 3 ||
        !message.data || !Array.isArray(message.data.items)) {
      return message;
    }

    var groups = message.data.items.reduce(function (filtered, group) {
      if (!Array.isArray(group)) return filtered;

      var exactItems = group.filter(function (item) {
        return item && exactLocations.has(item.location);
      });
      if (!exactItems.length) return filtered;

      var parent = group.find(function (item) {
        return item && typeof item.location === "string" && item.location.indexOf("#") === -1;
      });
      if (parent && exactItems.indexOf(parent) === -1) exactItems.push(parent);

      filtered.push(exactItems);
      return filtered;
    }, []);

    if (!groups.length) return message;

    return {
      type: message.type,
      data: Object.assign({}, message.data, { items: groups })
    };
  }

  self.addEventListener("message", function (event) {
    var message = event.data || {};

    if (message.type === 0 && message.data) {
      prepareDocuments(message.data.docs);
    } else if (message.type === 2) {
      pendingFilters.push(exactLocationsForQuery(String(message.data || "")));
    }
  });

  self.postMessage = function (message) {
    var args = Array.prototype.slice.call(arguments);
    var exactLocations = message && message.type === 3
      ? pendingFilters.shift()
      : null;

    args[0] = filterResult(message, exactLocations);
    return nativePostMessage.apply(null, args);
  };

  importScripts(upstreamUrl.href);
})();
