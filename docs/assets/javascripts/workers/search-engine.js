/* Shared by the build-time index compiler and the browser worker. */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.EdwinSearch = api;
})(typeof self === "undefined" ? globalThis : self, function () {
  "use strict";
  var VERSION = 1;
  var TOKENIZER = "edwinos-jieba-literal-v1";
  var WORD = /[\p{Script=Han}]+|(?:(?!\p{Script=Han})[\p{L}\p{N}_])+/gu;
  var HAN = /^\p{Script=Han}+$/u;
  var LATIN = /^[a-z]+$/;

  function normalize(value, retainSegments) {
    var text = String(value || "").normalize("NFKC").toLowerCase();
    return retainSegments ? text : text.replace(/\u200b/g, "");
  }
  function escape(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function decode(value) {
    return String(value || "").replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, function (_, code) {
      if (code[0] === "#") {
        var number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
      }
      return { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }[code.toLowerCase()];
    });
  }
  function plain(value, retainSegments) {
    var text = decode(String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/?(?:p|li|div|h[1-6]|pre|blockquote|tr|td|br)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, ""));
    return retainSegments ? text.normalize("NFC") : text.replace(/\u200b/g, "").normalize("NFC");
  }
  function display(value) {
    // Material preserves code/pre in its corpus. Keep their text provenance
    // while dropping every author-supplied tag and attribute from result HTML.
    var html = String(value || "").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    var text = "", codes = [], codeDepth = 0, preDepth = 0;
    (html.match(/<[^>]*>|[^<]+|</g) || []).forEach(function (part) {
      var tag = /^<(\/)?([a-z][\w-]*)\b[^>]*>$/i.exec(part);
      if (tag) {
        var name = tag[2].toLowerCase(), closing = Boolean(tag[1]);
        if (name === "code") codeDepth = Math.max(0, codeDepth + (closing ? -1 : 1));
        if (name === "pre") preDepth = Math.max(0, preDepth + (closing ? -1 : 1));
        if (/^(?:p|li|div|h[1-6]|pre|blockquote|tr|td|br)$/.test(name)) text += " ";
        return;
      }
      var start = text.length;
      text += decode(part).replace(/\u200b/g, "");
      if ((codeDepth || preDepth) && text.length > start) codes.push({ start: start, end: text.length });
    });
    codes = codes.map(function (range) {
      return { start: text.slice(0, range.start).normalize("NFC").length, end: text.slice(0, range.end).normalize("NFC").length };
    }).reduce(function (ranges, range) {
      var previous = ranges[ranges.length - 1];
      if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
      else ranges.push(range);
      return ranges;
    }, []);
    return { text: text.normalize("NFC"), codes: codes };
  }
  function slicedCodes(codes, start, end) {
    return codes.filter(function (range) { return range.start < end && range.end > start; }).map(function (range) {
      return { start: Math.max(start, range.start) - start, end: Math.min(end, range.end) - start };
    });
  }
  function normalizedPositions(text) {
    var value = normalize(text);
    if (value.length === text.length) return { value: value, start: function (i) { return i; }, end: function (i) { return i; } };
    // Compatibility characters such as ﬃ and ⑩ can expand while being
    // searched. Keep their spans tied to the author's original display text.
    var starts = [], ends = [], fragments = [], cursor = 0;
    Array.from(text).forEach(function (character) {
      var fragment = normalize(character);
      for (var i = 0; i < fragment.length; i++) { starts.push(cursor); ends.push(cursor + character.length); }
      fragments.push(fragment); cursor += character.length;
    });
    return { value: fragments.join(""), start: function (i) { return starts[i]; }, end: function (i) { return ends[i - 1]; } };
  }
  function tokens(value) {
    // Keep the build plugin's jieba word boundaries; reset both stemmer pipelines.
    return normalize(value, true).match(WORD) || [];
  }
  function prepare(rawDocs) {
    return rawDocs.map(function (raw, id) {
      var html = String(raw.text || "").replace(/<\/(?:p|li|div|h[1-6]|pre|blockquote|tr|td)>/gi, "$&\n")
        .replace(/<br\s*\/?\s*>/gi, "\n");
      var content = display(html), offset = 0, blocks = [], blockCodes = [];
      content.text.split(/\n/).forEach(function (part) {
        var trimmed = part.trim(), start = offset + part.length - part.trimStart().length;
        if (trimmed) { blocks.push(trimmed); blockCodes.push(slicedCodes(content.codes, start, start + trimmed.length)); }
        offset += part.length + 1;
      });
      var title = display(raw.title);
      var tags = Array.isArray(raw.tags) ? raw.tags.map(function (tag) { return plain(tag); }) : [];
      return {
        id: String(id), location: raw.location, page: String(raw.location).split("#")[0],
        title: title.text, titleCodes: title.codes, blocks: blocks, blockCodes: blockCodes, tags: tags,
        literal: normalize([plain(raw.title)].concat(blocks, tags).join("\n")),
        indexTitle: plain(raw.title, true), indexText: plain(raw.text, true), indexTags: tags.join(" ")
      };
    });
  }
  function buildIndex(docs, lunr) {
    return lunr(function () {
      this.ref("id");
      this.field("title", { boost: 5 }); this.field("text"); this.field("tags", { boost: 2 });
      this.pipeline.reset(); this.searchPipeline.reset();
      this.tokenizer = function (value) { return tokens(value).map(function (term) { return new lunr.Token(term); }); };
      docs.forEach(function (doc) {
        this.add({ id: doc.id, title: doc.indexTitle, text: doc.indexText, tags: doc.indexTags });
      }, this);
    });
  }
  function buildSerializedIndex(rawDocs, lunr) {
    return { version: VERSION, tokenizer: TOKENIZER, index: buildIndex(prepare(rawDocs), lunr).toJSON() };
  }
  function budget(term) {
    return LATIN.test(term) && term.length >= 5 && term.length <= 32 ? (term.length >= 9 ? 2 : 1) : 0;
  }
  // Optimal string alignment counts a neighboring letter exchange as one edit.
  function distance(a, b, limit) {
    if (Math.abs(a.length - b.length) > limit) return limit + 1;
    var previous = Array.from({ length: b.length + 1 }, function (_, i) { return i; });
    var before;
    for (var i = 1; i <= a.length; i++) {
      var row = [i];
      for (var j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + +(a[i - 1] !== b[j - 1]));
        if (before && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      }
      before = previous; previous = row;
    }
    return previous[b.length];
  }
  function parseQuery(value) {
    var raw = String(value || "").trim();
    var quoted = /^"[\s\S]*"$/.test(raw) || /^“[\s\S]*”$/.test(raw);
    return { terms: normalize(quoted ? raw.slice(1, -1) : raw).match(WORD) || [], quoted: quoted, prefix: !quoted && !/\s$/.test(value) };
  }
  function occurrences(text, terms, mode) {
    var normalized = normalizedPositions(text), normal = normalized.value;
    var words = [], re = new RegExp(WORD.source, "gu"), match;
    while ((match = re.exec(normal))) if (!HAN.test(match[0])) words.push({ start: normalized.start(match.index), end: normalized.end(re.lastIndex), term: match[0] });
    return terms.map(function (term, index) {
      if (HAN.test(term)) {
        var list = [];
        for (var start = normal.indexOf(term); start !== -1; start = normal.indexOf(term, start + 1)) list.push({ start: normalized.start(start), end: normalized.end(start + term.length), term: term, errors: 0 });
        return list;
      }
      return words.reduce(function (list, word) {
        var edits = word.term === term ? 0 : mode === "fuzzy" && budget(term) && LATIN.test(word.term) ? distance(term, word.term, budget(term)) : Infinity;
        if (mode === "prefix" && index === terms.length - 1 && LATIN.test(term) && term.length >= 3 && word.term.startsWith(term)) edits = 0;
        if (edits <= (mode === "fuzzy" ? budget(term) : 0)) list.push(Object.assign({}, word, { errors: edits }));
        return list;
      }, []);
    });
  }
  function overlap(a, b) { return a.start < b.end && b.start < a.end; }
  function wordGap(text, start, end) { return (normalize(text.slice(start, end)).match(WORD) || []).length; }
  function assignWords(lists) {
    var byPosition = new Map();
    lists.forEach(function (list) { list.forEach(function (span) { byPosition.set(span.start + ":" + span.end, span); }); });
    var spans = Array.from(byPosition.values()).sort(function (a, b) { return a.start - b.start; });
    var n = lists.length, m = spans.length;
    if (m < n) return null;
    var mappings = lists.map(function (list) { return new Map(list.map(function (span) { return [span.start + ":" + span.end, span]; })); });
    var unavailable = 1000000;
    var costs = mappings.map(function (mapping) { return spans.map(function (span) {
      var candidate = mapping.get(span.start + ":" + span.end); return candidate ? candidate.errors : unavailable;
    }); });
    // Rectangular Hungarian matching chooses distinct words with the smallest
    // total edit count. Greedy augmenting paths alone can overstate that count.
    var u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), owner = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
    for (var row = 1; row <= n; row++) {
      owner[0] = row;
      var column = 0, minimum = Array(m + 1).fill(Infinity), visited = Array(m + 1).fill(false);
      do {
        visited[column] = true;
        var current = owner[column], delta = Infinity, next = 0;
        for (var j = 1; j <= m; j++) if (!visited[j]) {
          var cost = costs[current - 1][j - 1] - u[current] - v[j];
          if (cost < minimum[j]) { minimum[j] = cost; way[j] = column; }
          if (minimum[j] < delta) { delta = minimum[j]; next = j; }
        }
        for (var k = 0; k <= m; k++) { if (visited[k]) { u[owner[k]] += delta; v[k] -= delta; } else minimum[k] -= delta; }
        column = next;
      } while (owner[column]);
      do { var previous = way[column]; owner[column] = owner[previous]; column = previous; } while (column);
    }
    var selected = Array(n);
    for (var position = 1; position <= m; position++) if (owner[position]) {
      var slot = owner[position] - 1;
      selected[slot] = mappings[slot].get(spans[position - 1].start + ":" + spans[position - 1].end);
      if (!selected[slot]) return null;
    }
    return selected;
  }
  function findMatch(text, terms, mode, onlyPhrase) {
    var lists = occurrences(text, terms, mode);
    if (lists.some(function (list) { return !list.length; })) return null;
    var best = null;
    // A contiguous ordered phrase is always preferable. This fast path also
    // handles repeated words without enumerating permutations of occurrences.
    lists[0].forEach(function (first) {
      var selected = [first];
      function phrase(depth) {
        if (depth === terms.length) {
          var errors = selected.reduce(function (sum, span) { return sum + span.errors; }, 0);
          var candidate = { spans: selected.slice(), start: first.start, end: selected[depth - 1].end,
            phrase: true, errors: errors, gap: 0, text: text };
          if (!best || errors < best.errors || errors === best.errors && candidate.end - candidate.start < best.end - best.start) best = candidate;
          return;
        }
        var previous = selected[depth - 1];
        lists[depth].forEach(function (item) {
          if (item.start < previous.end || /[\p{L}\p{N}_]/u.test(normalize(text.slice(previous.end, item.start)))) return;
          selected.push(item); phrase(depth + 1); selected.pop();
        });
      }
      phrase(1);
    });
    if (best || onlyPhrase) return best;
    if (terms.every(function (term) { return !HAN.test(term); })) {
      // Latin words occupy disjoint spans. Sliding context windows plus
      // bipartite matching give polynomial work instead of N! assignments.
      var events = new Map();
      lists.forEach(function (list) { list.forEach(function (span) { events.set(span.start + ":" + span.end, span); }); });
      var ordered = Array.from(events.values()).sort(function (a, b) { return a.start - b.start; });
      var lowerErrors = lists.reduce(function (sum, list) { return sum + Math.min.apply(null, list.map(function (span) { return span.errors; })); }, 0);
      ordered.forEach(function (left, leftIndex) {
        for (var rightIndex = leftIndex; rightIndex < ordered.length; rightIndex++) {
          var right = ordered[rightIndex];
          if (right.end - left.start > 240 || wordGap(text, left.start, right.end) > terms.length + 8) break;
          var window = lists.map(function (list) { return list.filter(function (span) { return span.start >= left.start && span.end <= right.end; }); });
          if (window.some(function (list) { return !list.length; })) continue;
          var assigned = assignWords(window);
          if (!assigned) continue;
          var sorted = assigned.slice().sort(function (a, b) { return a.start - b.start; });
          var start = sorted[0].start, end = sorted[sorted.length - 1].end;
          var gap = 0;
          sorted.forEach(function (span, i) { if (i) gap += wordGap(text, sorted[i - 1].end, span.start); });
          var errors = assigned.reduce(function (sum, span) { return sum + span.errors; }, 0);
          var found = { spans: assigned, start: start, end: end, phrase: false, errors: errors, gap: gap, text: text };
          if (gap <= 8 && (!best || errors < best.errors || errors === best.errors && end - start < best.end - best.start)) best = found;
          if (mode !== "fuzzy" || errors === lowerErrors) break;
        }
      });
      return best;
    }
    // Assign separate, nonoverlapping spans even for repeated or fuzzy terms.
    // The 240-character / eight-word context window excludes remote mentions.
    var anchorMap = new Map();
    [].concat.apply([], lists).forEach(function (span) { anchorMap.set(span.start, span); });
    Array.from(anchorMap.values()).forEach(function (anchor) {
      var eligible = lists.map(function (list) { return list.filter(function (item) { return item.start >= anchor.start && item.start <= anchor.start + 240; }); });
      if (eligible.some(function (list) { return !list.length; })) return;
      var order = terms.map(function (_, i) { return i; }).sort(function (a, b) { return eligible[a].length - eligible[b].length; });
      var selected = Array(terms.length), assigned = false;
      // Hall's matching condition rejects shortages before interval assignment.
      // In particular, twelve repeated query words cannot share one occurrence.
      var owner = new Map();
      function augment(slot, visited) {
        return eligible[slot].some(function (span) {
          var id = span.start + ":" + span.end;
          if (visited.has(id)) return false;
          visited.add(id);
          if (!owner.has(id) || augment(owner.get(id), visited)) { owner.set(id, slot); return true; }
          return false;
        });
      }
      if (!order.every(function (slot) { return augment(slot, new Set()); })) return;
      function assign(depth) {
        if (assigned) return;
        if (depth === order.length) {
          var sorted = selected.slice().sort(function (a, b) { return a.start - b.start; });
          var start = sorted[0].start, end = sorted[sorted.length - 1].end;
          var phrase = selected.every(function (item, i) {
            return !i || selected[i - 1].end <= item.start && !/[\p{L}\p{N}_]/u.test(normalize(text.slice(selected[i - 1].end, item.start)));
          });
          if (onlyPhrase && !phrase) return;
          var gap = 0;
          sorted.forEach(function (item, i) { if (i) gap += wordGap(text, sorted[i - 1].end, item.start); });
          if (!phrase && gap > 8) return;
          var errors = selected.reduce(function (sum, item) { return sum + item.errors; }, 0);
          var candidate = { spans: selected.slice(), start: start, end: end, phrase: phrase, errors: errors, gap: gap, text: text };
          if (!best || errors < best.errors || errors === best.errors && end - start < best.end - best.start) best = candidate;
          assigned = true;
          return;
        }
        var slot = order[depth];
        eligible[slot].forEach(function (item) {
          if (selected.some(function (previous) { return previous && overlap(previous, item); })) return;
          // Identical query terms are interchangeable. Reserve them in order
          // instead of exploring every permutation of the same Han spans.
          if (selected.some(function (previous, i) { return previous && terms[i] === terms[slot] && (i < slot ? previous.start >= item.start : previous.start <= item.start); })) return;
          selected[slot] = item; assign(depth + 1); selected[slot] = undefined;
        });
      }
      assign(0);
    });
    return best;
  }
  function compare(a, b) {
    return a.tier - b.tier || a.match.errors - b.match.errors || a.match.gap - b.match.gap ||
      (a.match.end - a.match.start) - (b.match.end - b.match.start) || b.nativeScore - a.nativeScore || a.doc.location.localeCompare(b.doc.location);
  }
  var segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  function graphemes(text) {
    if (segmenter) return Array.from(segmenter.segment(text), function (item) { return item.segment; });
    var parts = [];
    Array.from(text).forEach(function (character) {
      var previous = parts[parts.length - 1];
      var regional = /^\p{Regional_Indicator}$/u.test(character);
      if (previous && (/^[\p{M}\p{Emoji_Modifier}\u200d]$/u.test(character) || previous.endsWith("\u200d") || regional && /^\p{Regional_Indicator}$/u.test(previous))) parts[parts.length - 1] += character;
      else parts.push(character);
    });
    return parts;
  }
  function mathRanges(text, codes) {
    if (codes && codes.length) {
      var ranges = [], cursor = 0;
      codes.concat([{ start: text.length, end: text.length }]).forEach(function (code) {
        mathRanges(text.slice(cursor, code.start)).forEach(function (range) {
          ranges.push({ start: range.start + cursor, end: range.end + cursor });
        });
        cursor = code.end;
      });
      return ranges;
    }
    var ranges = [], cursor = 0;
    function escaped(index) {
      var count = 0;
      while (index > 0 && text[--index] === "\\") count++;
      return count % 2 === 1;
    }
    while (cursor < text.length) {
      var opener = text.slice(cursor, cursor + 2), closer;
      if (!escaped(cursor) && (opener === "\\(" || opener === "\\[")) closer = opener === "\\(" ? "\\)" : "\\]";
      else if (text[cursor] === "$" && !escaped(cursor)) { opener = text[cursor + 1] === "$" ? "$$" : "$"; closer = opener; }
      else { cursor++; continue; }
      var end = cursor + opener.length;
      while (end < text.length && (text.slice(end, end + closer.length) !== closer || escaped(end))) end++;
      if (end >= text.length) { cursor += opener.length; continue; }
      var body = text.slice(cursor + opener.length, end);
      if (body && (opener !== "$" || !/^\s|\s$/.test(body))) {
        ranges.push({ start: cursor, end: end + closer.length });
        cursor = end + closer.length;
      } else cursor += opener.length;
    }
    return ranges;
  }
  function snippetBounds(text, spans, budget, codes) {
    if (!text.length) return { start: 0, end: 0 };
    // A heading-only hit still needs a bounded excerpt from its section body.
    // Empty spans reserve no highlighted text, then use the context budget.
    if (!spans.length) spans = [{ start: 0, end: 0 }];
    var parts = [], cursor = 0;
    var segments = graphemes(text);
    segments.forEach(function (segment) {
      // Wide scripts and emoji take more room than Latin letters. This is an
      // initial excerpt budget; the result view may fit it to its actual width.
      var width = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}]/u.test(segment) ? 2.4 : /^\s+$/u.test(segment) ? 0.5 : 1;
      parts.push({ start: cursor, end: cursor + segment.length, width: width });
      cursor += segment.length;
    });
    var first = Math.min.apply(null, spans.map(function (span) { return span.start; }));
    var last = Math.max.apply(null, spans.map(function (span) { return span.end; }));
    var left = 0, right = parts.length;
    while (left < parts.length && parts[left].end <= first) left++;
    while (right > left && parts[right - 1].start >= last) right--;
    var matchWidth = parts.slice(left, right).reduce(function (sum, part) { return sum + part.width; }, 0);
    var remaining = Math.max(0, (budget || 480) - matchWidth), before = 0, after = 0;
    // Share the available context evenly, and use the other side when a match
    // is close to a paragraph edge. Never trim any part of a matching phrase.
    while (remaining > 0 && (left > 0 || right < parts.length)) {
      var useLeft = left > 0 && (right === parts.length || before <= after);
      var next = useLeft ? parts[left - 1] : parts[right];
      if (next.width > remaining) break;
      if (useLeft) { left--; before += next.width; } else { right++; after += next.width; }
      remaining -= next.width;
    }
    var start = parts[left].start, end = parts[right - 1].end;
    // Prefer complete Latin words at excerpt edges without changing the match.
    while (start < first && start > 0 && /[\p{Script=Latin}\p{M}\p{N}_]/u.test(text[start - 1]) && /[\p{Script=Latin}\p{M}\p{N}_]/u.test(text[start])) start++;
    while (end > last && end < text.length && /[\p{Script=Latin}\p{M}\p{N}_]/u.test(text[end - 1]) && /[\p{Script=Latin}\p{M}\p{N}_]/u.test(text[end])) end--;
    while (start < first && /\s/u.test(text[start])) start++;
    while (end > last && /\s/u.test(text[end - 1])) end--;
    // TeX is an atomic excerpt unit. Keep complete matching formulas; omit a
    // nonmatching formula sliced by a context edge instead of showing half TeX.
    mathRanges(text, codes).forEach(function (formula) {
      if (start > formula.start && start < formula.end) start = formula.end <= first ? formula.end : formula.start;
      if (end > formula.start && end < formula.end) end = formula.start >= last ? formula.start : formula.end;
    });
    return { start: start, end: end };
  }
  function highlighted(text, spans, teaser, codes) {
    var start = 0, end = text.length;
    if (teaser) {
      var bounds = snippetBounds(text, spans, undefined, codes);
      start = bounds.start; end = bounds.end;
    }
    var ranges = spans.filter(function (span) { return span.end > start && span.start < end; }).slice().sort(function (a, b) { return a.start - b.start; }).reduce(function (merged, span) {
      var previous = merged[merged.length - 1];
      if (previous && (span.start <= previous.end || !/[\p{L}\p{N}_]/u.test(normalize(text.slice(previous.end, span.start))))) previous.end = Math.max(previous.end, span.end);
      else merged.push({ start: span.start, end: span.end });
      return merged;
    }, []);
    function render(left, right) {
      var output = "", cursor = left;
      ranges.forEach(function (span) {
        var markStart = Math.max(left, span.start), markEnd = Math.min(right, span.end);
        if (markStart >= markEnd) return;
        output += escape(text.slice(cursor, markStart)) + "<mark>" + escape(text.slice(markStart, markEnd)) + "</mark>";
        cursor = markEnd;
      });
      return output + escape(text.slice(cursor, right));
    }
    var output = start ? "..." : "", cursor = start;
    (codes || []).forEach(function (code) {
      var left = Math.max(start, code.start), right = Math.min(end, code.end);
      if (left >= right) return;
      output += render(cursor, left) + "<code>" + render(left, right) + "</code>";
      cursor = right;
    });
    return output + render(cursor, end) + (end < text.length ? "..." : "");
  }
  function excerptFor(hit) {
    // Rank the result as before, but describe its first body occurrence. The
    // section text is already scoped by Material; neither neighbouring titles
    // nor another section's paragraphs can enter these excerpts.
    var text = hit.doc.blocks.join(" "), anchors = [], codes = [], offset = 0;
    hit.doc.blocks.forEach(function (block, index) {
      hit.doc.blockCodes[index].forEach(function (code) { codes.push({ start: code.start + offset, end: code.end + offset }); });
      offset += block.length + 1;
    });
    if (!text) text = hit.match.text;
    var lists = occurrences(text, hit.queryTerms, hit.matchMode);
    // Material highlights accepted words individually, including a quoted
    // query's words. Keep the mandatory excerpt aligned with the first such
    // body mark; strict phrase acceptance remains exclusively in retrieval.
    var unique = new Map();
    lists.forEach(function (list) { list.forEach(function (span) {
      unique.set(span.start + ":" + span.end, { start: span.start, end: span.end, spans: [span] });
    }); });
    anchors = Array.from(unique.values()).sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    if (!anchors.length) {
      var bodyBounds = snippetBounds(text, [], undefined, codes);
      return [{ text: text.slice(bodyBounds.start, bodyBounds.end), spans: [], codes: slicedCodes(codes, bodyBounds.start, bodyBounds.end),
        before: bodyBounds.start > 0, after: bodyBounds.end < text.length }];
    }
    var firstBounds = snippetBounds(text, [anchors[0]], undefined, codes);
    var hasDistant = anchors.some(function (anchor) { return anchor.start >= firstBounds.end; });
    var contextBudget = hasDistant ? 160 : 480, windows = [], cursor = 0, count = 0;
    while (cursor < anchors.length && count++ < 3) {
      var bounds = snippetBounds(text, [anchors[cursor]], contextBudget, codes);
      var previousWindow = windows[windows.length - 1];
      if (previousWindow && bounds.start <= previousWindow.end) previousWindow.end = Math.max(previousWindow.end, bounds.end);
      else windows.push(bounds);
      do { cursor++; } while (cursor < anchors.length && anchors[cursor].start < bounds.end);
    }
    return windows.map(function (bounds) {
      var spans = [];
      anchors.forEach(function (anchor) {
        if (anchor.start >= bounds.start && anchor.end <= bounds.end) anchor.spans.forEach(function (span) {
          spans.push(Object.assign({}, span, { start: span.start - bounds.start, end: span.end - bounds.start }));
        });
      });
      return { text: text.slice(bounds.start, bounds.end), spans: spans, codes: slicedCodes(codes, bounds.start, bounds.end), before: bounds.start > 0, after: bounds.end < text.length };
    });
  }
  function createEngine(rawDocs, lunr, serialized) {
    var docs = prepare(rawDocs), index;
    if (serialized && serialized.version === VERSION && serialized.tokenizer === TOKENIZER && serialized.index) {
      try { index = lunr.Index.load(serialized.index); } catch (error) { console.warn("Rebuilding invalid EdwinOS search index", error); }
    }
    if (!index) index = buildIndex(docs, lunr);
    docs.forEach(function (doc) { delete doc.indexTitle; delete doc.indexText; delete doc.indexTags; });
    var parents = new Map(), cache = new Map();
    docs.forEach(function (doc) { if (doc.location === doc.page) parents.set(doc.page, doc); });
    function nativeCandidates(terms, mode) {
      // Chinese must occur continuously in the original text. Scan the small
      // scoped corpus instead of constructing huge character posting lists.
      var latin = terms.filter(function (term) { return !HAN.test(term); });
      if (!latin.length) return docs.map(function (doc) { return { ref: doc.id, score: 0 }; });
      return index.query(function (query) {
        latin.forEach(function (term) {
          var options = { presence: lunr.Query.presence.REQUIRED, usePipeline: false };
          // Lunr's automaton includes neighboring transpositions. Verify the
          // same bounded edit policy against the actual words before display.
          if (mode === "fuzzy" && budget(term)) options.editDistance = budget(term);
          if (mode === "prefix" && term === terms[terms.length - 1]) options.wildcard = lunr.Query.wildcard.TRAILING;
          query.term(term, options);
        });
      });
    }
    function retrieve(parsed, mode) {
      var hits = [];
      nativeCandidates(parsed.terms, mode).forEach(function (candidate) {
        var doc = docs[Number(candidate.ref)], best;
        if (parsed.terms.some(function (term) { return HAN.test(term) && doc.literal.indexOf(term) === -1; })) return;
        [doc.title].concat(doc.blocks, doc.tags).forEach(function (text) {
          var match = findMatch(text, parsed.terms, mode, parsed.quoted);
          if (!match) return;
          var result = { doc: doc, match: match, tier: mode === "fuzzy" ? 4 : mode === "prefix" ? 5 : match.phrase ? 1 : 2, nativeScore: candidate.score,
            queryTerms: parsed.terms, matchMode: mode };
          if (!best || compare(result, best) < 0) best = result;
        });
        if (!best && !parsed.quoted && mode === "exact" && doc.location !== doc.page) {
          // Context is this chapter's own heading and one of its paragraphs.
          var heading = occurrences(doc.title, parsed.terms, "exact");
          var reserved = [], headingSpans = [], present = [];
          heading.forEach(function (list, i) {
            var span = list.find(function (item) { return !reserved.some(function (used) { return overlap(used, item); }); });
            if (span) { reserved.push(span); headingSpans.push(span); present.push(i); }
          });
          if (present.length && present.length < parsed.terms.length) {
            var remaining = parsed.terms.filter(function (_, i) { return present.indexOf(i) === -1; });
            doc.blocks.forEach(function (text) {
              var match = findMatch(text, remaining, "exact", false);
              if (!match) return;
              var result = { doc: doc, match: match, tier: 3, nativeScore: candidate.score, headingSpans: headingSpans,
                queryTerms: parsed.terms, matchMode: mode };
              if (!best || compare(result, best) < 0) best = result;
            });
          }
        }
        if (best) hits.push(best);
      });
      return hits.sort(compare);
    }
    function itemFor(hit) {
      var doc = hit.doc;
      var titleMatch = hit.headingSpans ? null : findMatch(doc.title, hit.match.spans.map(function (span) { return span.term; }), "exact", false);
      var titleSpans = hit.headingSpans || (titleMatch ? titleMatch.spans : []);
      var terms = {};
      hit.match.spans.concat(hit.headingSpans || []).forEach(function (span) { terms[span.term] = true; });
      var excerpts = excerptFor(hit);
      excerpts.forEach(function (excerpt) { excerpt.spans.forEach(function (span) { terms[span.term] = true; }); });
      var text = excerpts.map(function (excerpt, index) {
        return (index ? " ... " : excerpt.before ? "..." : "") +
          '<span data-edwinos-search-segment="' + index + '" data-start-truncated="' + excerpt.before +
          '" data-end-truncated="' + excerpt.after + '">' + highlighted(excerpt.text, excerpt.spans, false, excerpt.codes) + "</span>";
      }).join("") + (excerpts[excerpts.length - 1].after ? "..." : "");
      return {
        location: doc.location, title: highlighted(doc.title, titleSpans, false, doc.titleCodes),
        text: "<p>" + text + "</p>",
        score: Math.max(1, (6 - hit.tier) * 100000 - hit.match.errors * 1000 - hit.match.gap * 100 - Math.min(999, hit.match.end - hit.match.start)) + Math.min(1, hit.nativeScore),
        terms: terms, tags: doc.tags.map(escape)
      };
    }
    function search(value) {
      var key = String(value || "");
      if (cache.has(key)) { var saved = cache.get(key); cache.delete(key); cache.set(key, saved); return saved; }
      var parsed = parseQuery(key), hits = [], mode = "empty";
      if (key.length <= 256 && parsed.terms.length) {
        hits = retrieve(parsed, "exact");
        if (!hits.length && !parsed.quoted && parsed.terms.some(function (term) { return budget(term); })) hits = retrieve(parsed, "fuzzy");
        if (!hits.length && parsed.prefix && LATIN.test(parsed.terms[parsed.terms.length - 1]) && parsed.terms[parsed.terms.length - 1].length >= 3) hits = retrieve(parsed, "prefix");
        if (hits.length) mode = { 1: "phrase", 2: "near", 3: "context", 4: "fuzzy", 5: "prefix" }[hits[0].tier];
      }
      var groups = new Map();
      hits.forEach(function (hit) { if (!groups.has(hit.doc.page)) groups.set(hit.doc.page, []); groups.get(hit.doc.page).push(itemFor(hit)); });
      groups.forEach(function (items, page) {
        if (items.some(function (item) { return item.location === page; })) return;
        var parent = parents.get(page);
        items.push({ location: page, title: escape(parent ? parent.title : page), text: "", score: 0, terms: {}, tags: parent ? parent.tags.map(escape) : [] });
      });
      var result = { items: Array.from(groups.values()), mode: mode };
      cache.set(key, result); if (cache.size > 64) cache.delete(cache.keys().next().value);
      return result;
    }
    return { search: search, index: index };
  }
  return { VERSION: VERSION, TOKENIZER: TOKENIZER, createEngine: createEngine, buildSerializedIndex: buildSerializedIndex };
});
