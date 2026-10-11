/* ==============================================================================
 * MathJax 3 configuration and TOC rendering adapter
 *
 * 默认 pymdownx.arithmatex (generic: true) 只在正文标题中插入
 *   <span class="arithmatex">\(...\)</span>
 * 而右侧目录 (TOC) 中只有 .md-ellipsis 里的纯文本 "\(sp^3\)"
 * MathJax 因 ignoreHtmlClass=".*|" + processHtmlClass="arithmatex" 默认跳过 TOC
 *
 * Responsibilities:
 * 1. 在 typeset 之前，扫描 TOC 中的 .md-ellipsis，把任何含 \(...\) 的文本
 *    重新包裹为 <span class="arithmatex">...</span>，让 MathJax 接管渲染。
 * 2. 同时显式调用 typesetPromise 处理整个文档。
 * 3. Typesetting completion is announced semantically; block-links.js remains
 *    the sole owner of fragment positioning after layout changes.
 * 4. Complete TeX in search excerpts is wrapped safely and typeset lazily in
 *    the same queue, without clearing article math or equation counters.
 * ============================================================================== */
(function () {
  "use strict";

  var mathJaxConfigScript = document.currentScript;
  var mathJaxBaseUrl = mathJaxConfigScript && mathJaxConfigScript.src
    ? mathJaxConfigScript.src
    : document.baseURI;
  var MATHJAX_SRC = new URL(
    "vendor/mathjax/3.2.2/es5/tex-mml-chtml.js",
    mathJaxBaseUrl
  ).href;
  var mathJaxLoadPromise = null;
  var navigationSequence = 0;
  var typesetQueue = Promise.resolve();
  var mathResizeFrame = 0;
  var HASH_LAYOUT_SETTLED_EVENT = "edwinos:hash-layout-settled";
  var searchMathStates = new WeakMap();
  var trackedSearchMath = new Set();
  var articleMathRoot = null;
  var articleMathObserver = null;
  var articleMathCleanText = new WeakMap();

  window.MathJax = {
    tex: {
      macros: {
        prescript: ["{}^{#1}_{#2}\\!#3", 3],
        boldsymbol: ["\\mathbf{#1}", 1],
        // The bundled MathJax build does not include mathtools. This reviewed
        // fallback preserves annotation text instead of exposing \mathclap as
        // a red undefined control sequence.
        mathclap: ["\\smash{#1}", 1]
      },
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      processEscapes: true,
      processEnvironments: true
    },
    options: {
      ignoreHtmlClass: ".*|",
      processHtmlClass: "arithmatex"
    },
    chtml: {
      // Material replaces dynamic head nodes during instant navigation. Full
      // rules survive style re-insertion; adaptive CSSOM insertRule additions
      // would be lost while MathJax still caches their glyphs as emitted.
      adaptiveCSS: false
    },
    startup: {
      // document$ owns the first and subsequent typesets so lazy loading and
      // instant-navigation updates follow the same lifecycle.
      typeset: false
    }
  };

/**
 * 把目录中所有含 inline math 分隔符的文本节点包成 .arithmatex 容器，
 * 让 MathJax 的 processHtmlClass 过滤器认得它。
 * 同时处理 nav 的 aria-label（屏幕阅读器会念出，至少去掉源码字符串）
 */
function wrapTocMath() {
  // 右侧 TOC + 左侧侧栏的所有 .md-ellipsis（含 H1 nav 入口与子级）
  const tocLinks = document.querySelectorAll(
    '[data-md-component="toc"] .md-ellipsis, .md-nav--secondary .md-ellipsis'
  );

  const inlineRegex = /\\\(([\s\S]+?)\\\)/g;
  const displayRegex = /\\\[([\s\S]+?)\\\]/g;

  tocLinks.forEach((el) => {
    // 只处理一次：用 data-math-wrapped 做幂等标记
    if (el.dataset.mathWrapped === "1") return;
    const text = el.textContent;
    if (!inlineRegex.test(text) && !displayRegex.test(text)) return;

    // reset lastIndex（全局正则有副作用）
    inlineRegex.lastIndex = 0;
    displayRegex.lastIndex = 0;

    // 重建 innerHTML：把每一段 \(...\) 或 \[...\] 都包成 <span class="arithmatex">
    let html = el.innerHTML;
    html = html.replace(inlineRegex, (m, body) => {
      return `<span class="arithmatex">\\(${body}\\)</span>`;
    });
    html = html.replace(displayRegex, (m, body) => {
      return `<span class="arithmatex">\\[${body}\\]</span>`;
    });
    el.innerHTML = html;
    el.dataset.mathWrapped = "1";
  });

  // 也把 aria-label 中的 \(...\) 去掉外层 LaTeX 分隔符（屏幕阅读器更友好；
  // MathJax 不渲染 aria-label，所以源码字符串会出现在无障碍读屏中）
  document.querySelectorAll('nav.md-nav[aria-label]').forEach((nav) => {
    const lbl = nav.getAttribute("aria-label");
    if (lbl && /\\\(|\\\[/.test(lbl)) {
      const cleaned = lbl
        .replace(/\\\(([\s\S]+?)\\\)/g, "$1")
        .replace(/\\\[([\s\S]+?)\\\]/g, "$1");
      nav.setAttribute("aria-label", cleaned);
    }
  });
}

function pageNeedsMath() {
  var root = document.querySelector(".md-content__inner") || document.body;
  if (!root) return false;
  if (root.querySelector(".arithmatex")) return true;
  return /\\\(|\\\[/.test(root.textContent || "");
}

function mathJaxIsReady() {
  return Boolean(
    window.MathJax &&
    typeof window.MathJax.typesetClear === "function" &&
    typeof window.MathJax.texReset === "function" &&
    typeof window.MathJax.typesetPromise === "function"
  );
}

function loadMathJax() {
  if (mathJaxIsReady()) return Promise.resolve();
  if (mathJaxLoadPromise) return mathJaxLoadPromise;

  mathJaxLoadPromise = new Promise(function (resolve, reject) {
    var script = document.getElementById("mathjax-runtime");

    function handleLoad() {
      if (mathJaxIsReady()) {
        resolve();
      } else {
        reject(new Error("MathJax loaded without its typesetting API"));
      }
    }

    function handleError() {
      if (script && script.parentNode) script.parentNode.removeChild(script);
      reject(new Error("MathJax failed to load"));
    }

    var shouldAppend = !script;
    if (shouldAppend) {
      script = document.createElement("script");
      script.src = MATHJAX_SRC;
      script.async = true;
      script.id = "mathjax-runtime";
    }

    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    if (shouldAppend) document.head.appendChild(script);
  }).catch(function (error) {
    mathJaxLoadPromise = null;
    throw error;
  });

  return mathJaxLoadPromise;
}

function typesetCurrentDocument() {
  var sequence = ++navigationSequence;
  protectArticleMath();
  wrapTocMath();

  // Preserve lazy loading: a page without math doesn't fetch MathJax. Once it
  // has loaded, still clear its previous document state on every navigation.
  if (!mathJaxIsReady() && !pageNeedsMath()) return;

  var ready = mathJaxIsReady() ? Promise.resolve() : loadMathJax();

  ready.then(function () {
    typesetQueue = typesetQueue
      .catch(function () {
        // Keep a rejected typeset from blocking later navigations.
      })
      .then(function () {
        // A faster navigation superseded this page while MathJax was loading or
        // typesetting. Only ever touch the current Material document.
        if (sequence !== navigationSequence) return;

        protectArticleMath();
        wrapTocMath();
        window.MathJax.typesetClear();
        window.MathJax.texReset();
        return window.MathJax.typesetPromise().then(function () {
          if (sequence !== navigationSequence) return;
          classifyWideInlineMath();
          announceHashLayoutSettled(sequence);
        });
      });

    // Always attach a rejection handler: asset-load and rapid-navigation
    // failures must not surface as uncaught promise rejections.
    typesetQueue.catch(function () {
      // A later document$ emission can safely retry the lifecycle.
    });
  }).catch(function () {
    // Keep raw TeX readable if the local optional runtime cannot be loaded.
  });
}

// Material's ?h= search highlighting splits TeX into text and mark nodes.
// Join only its marks inside formulas; author marks and prose highlights stay.
function clearArticleMathHighlights(formulas) {
  var changed = [];
  formulas.forEach(function (formula) {
    var marks = formula.querySelectorAll("mark[data-md-highlight]");
    marks.forEach(function (mark) { mark.replaceWith.apply(mark, Array.from(mark.childNodes)); });
    if (marks.length) formula.normalize();
    var decoded = false;
    // Material also escapes <, > and & in text without a keyword match.
    // Restore them as text, never HTML, so inequalities and alignments remain
    // valid TeX. Remember the clean text to avoid decoding it twice.
    if (/[?&]h=[^&]+/.test(window.location.search || "") &&
        articleMathCleanText.get(formula) !== formula.textContent) {
      var entities = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
      function restore(node) {
        if (node.nodeType === 3) {
          var text = node.textContent.replace(/&(?:amp|lt|gt|quot|#39);/g, function (entity) {
            decoded = true;
            return entities[entity];
          });
          if (text !== node.textContent) node.textContent = text;
        } else node.childNodes.forEach(restore);
      }
      restore(formula);
      articleMathCleanText.set(formula, formula.textContent);
    }
    if (marks.length || decoded) {
      formula.normalize();
      changed.push(formula);
    }
  });
  return changed;
}

function protectArticleMath() {
  var root = document.querySelector(".md-content__inner");
  if (root !== articleMathRoot) {
    if (articleMathObserver) articleMathObserver.disconnect();
    articleMathObserver = null;
    articleMathRoot = root;
    if (root && typeof MutationObserver === "function") {
      // The search index can arrive after document$ and MathJax have settled.
      articleMathObserver = new MutationObserver(function (records) {
        var affected = new Set();
        records.forEach(function (record) {
          record.addedNodes.forEach(function (node) {
            if (/&(?:amp|lt|gt|quot|#39);/.test(node.textContent || "")) {
              var parent = node.nodeType === 1 ? node : node.parentElement;
              var escapedFormula = parent && parent.closest(".arithmatex");
              if (escapedFormula && root.contains(escapedFormula)) affected.add(escapedFormula);
            }
            if (node.nodeType !== 1) return;
            var marks = node.matches("mark[data-md-highlight]")
              ? [node] : node.querySelectorAll("mark[data-md-highlight]");
            marks.forEach(function (mark) {
              var formula = mark.closest(".arithmatex");
              if (formula && root.contains(formula)) affected.add(formula);
            });
          });
        });
        var changed = clearArticleMathHighlights(Array.from(affected));
        if (!changed.length) return;
        var sequence = navigationSequence;
        typesetQueue = typesetQueue.catch(function () {}).then(function () {
          if (sequence !== navigationSequence || articleMathRoot !== root || !mathJaxIsReady()) return;
          var pending = changed.filter(function (formula) {
            return formula.isConnected && !formula.querySelector("mjx-container");
          });
          if (!pending.length) return;
          // A late highlight retries only unrendered formulas, preserving all
          // existing MathItems, equation counters and search excerpt state.
          return window.MathJax.typesetPromise(pending).then(function () {
            if (sequence !== navigationSequence) return;
            classifyWideInlineMath();
            announceHashLayoutSettled(sequence);
          });
        });
        typesetQueue.catch(function () {});
      });
      articleMathObserver.observe(root, { childList: true, subtree: true });
    }
  }
  if (root) clearArticleMathHighlights(root.querySelectorAll(".arithmatex"));
}

function classifyWideInlineMath() {
  var formulas = document.querySelectorAll(
    ".md-content__inner span.arithmatex:not(.arithmatex--display)"
  );
  var updates = [];

  formulas.forEach(function (formula) {
    var math = formula.querySelector("mjx-container");
    if (!math) return;
    var prose = formula.closest("p, li, td, th, blockquote") || formula.parentElement;
    if (!prose) return;

    // Use the actual typeset width, not the current scroll pane width. This
    // also removes the class when a wider viewport makes the formula fit.
    updates.push({
      formula: formula,
      wide: math.getBoundingClientRect().width > prose.clientWidth + 1
    });
  });

  updates.forEach(function (item) {
    item.formula.classList.toggle("edwinos-math-overflow", item.wide);
  });
}

window.addEventListener("resize", function () {
  if (mathResizeFrame) window.cancelAnimationFrame(mathResizeFrame);
  mathResizeFrame = window.requestAnimationFrame(function () {
    mathResizeFrame = 0;
    classifyWideInlineMath();
  });
});

function announceHashLayoutSettled(sequence) {
  if (sequence !== navigationSequence || !window.location.hash) return;
  document.dispatchEvent(new CustomEvent(HASH_LAYOUT_SETTLED_EVENT, {
    detail: { hash: window.location.hash }
  }));
}

// Search excerpts are escaped text, rather than Markdown arithmatex nodes.
// Recognize only complete delimiters; malformed or truncated TeX stays readable.
function searchMathRanges(text, codes) {
  if (codes && codes.length) {
    var safe = [], cursor = 0;
    codes.concat([{ start: text.length, end: text.length }]).forEach(function (code) {
      searchMathRanges(text.slice(cursor, code.start)).forEach(function (range) {
        safe.push({ start: range.start + cursor, end: range.end + cursor, body: range.body });
      });
      cursor = code.end;
    });
    return safe;
  }
  var ranges = [], cursor = 0;
  function escaped(index) {
    var count = 0;
    while (index > 0 && text[--index] === "\\") count++;
    return count % 2 === 1;
  }
  while (cursor < text.length) {
    var opener = text.slice(cursor, cursor + 2), closer;
    if (!escaped(cursor) && (opener === "\\(" || opener === "\\[")) {
      closer = opener === "\\(" ? "\\)" : "\\]";
    } else if (text[cursor] === "$" && !escaped(cursor)) {
      opener = text[cursor + 1] === "$" ? "$$" : "$";
      closer = opener;
    } else { cursor++; continue; }
    var end = cursor + opener.length;
    while (end < text.length && (text.slice(end, end + closer.length) !== closer || escaped(end))) end++;
    if (end >= text.length) { cursor += opener.length; continue; }
    var body = text.slice(cursor + opener.length, end);
    // A leading/trailing space after a single dollar is usually prose/currency.
    if (body && (opener !== "$" || !/^\s|\s$/.test(body))) {
      ranges.push({ start: cursor, end: end + closer.length, body: body });
      cursor = end + closer.length;
    } else cursor += opener.length;
  }
  return ranges;
}

function clearSearchMath(node) {
  if (!searchMathStates.has(node)) return;
  if (mathJaxIsReady()) window.MathJax.typesetClear([node]);
  searchMathStates.delete(node);
  trackedSearchMath.delete(node);
}

function prepareSearchMath(node) {
  if (searchMathStates.has(node)) return false;
  var text = "", marks = [], codes = [], provenance = [];
  function collect(child, marked, coded) {
    if (child.nodeType === 3) {
      var start = text.length;
      text += child.textContent;
      if (marked) marks.push({ start: start, end: text.length });
      if (coded) codes.push({ start: start, end: text.length });
    } else if (child.nodeType === 1) {
      // The article name belongs to the heading but is separate metadata. Keep
      // its node, styling and math lifecycle intact when replacing title TeX.
      if (child.classList && child.classList.contains("edwinos-search-provenance")) {
        provenance.push(child);
        return;
      }
      child.childNodes.forEach(function (part) { collect(part, marked || child.tagName === "MARK", coded || child.tagName === "CODE" || child.tagName === "PRE"); });
    }
  }
  node.childNodes.forEach(function (child) { collect(child, false); });
  codes = codes.reduce(function (ranges, code) {
    var previous = ranges[ranges.length - 1];
    if (previous && code.start <= previous.end) previous.end = code.end;
    else ranges.push(code);
    return ranges;
  }, []);
  var formulas = searchMathRanges(text, codes);
  if (!formulas.length) return false;
  var fragment = document.createDocumentFragment(), cursor = 0;
  function appendPlain(parent, start, end) {
    var position = start;
    marks.forEach(function (mark) {
      var left = Math.max(start, mark.start), right = Math.min(end, mark.end);
      if (left >= right) return;
      parent.appendChild(document.createTextNode(text.slice(position, left)));
      var highlight = document.createElement("mark");
      highlight.textContent = text.slice(left, right);
      parent.appendChild(highlight);
      position = right;
    });
    parent.appendChild(document.createTextNode(text.slice(position, end)));
  }
  function appendText(start, end) {
    var position = start;
    codes.forEach(function (code) {
      var left = Math.max(start, code.start), right = Math.min(end, code.end);
      if (left >= right) return;
      appendPlain(fragment, position, left);
      var element = document.createElement("code");
      appendPlain(element, left, right);
      fragment.appendChild(element);
      position = right;
    });
    appendPlain(fragment, position, end);
  }
  formulas.forEach(function (formula) {
    appendText(cursor, formula.start);
    var span = document.createElement("span");
    span.className = "arithmatex";
    span.dataset.searchMath = "1";
    // Compact excerpts render display-source formulas inline as one atomic unit.
    span.textContent = "\\(" + formula.body + "\\)";
    if (marks.some(function (mark) { return mark.start < formula.end && mark.end > formula.start; })) {
      var highlight = document.createElement("mark");
      highlight.appendChild(span);
      fragment.appendChild(highlight);
    } else fragment.appendChild(span);
    cursor = formula.end;
  });
  appendText(cursor, text.length);
  provenance.forEach(function (source) { fragment.appendChild(source); });
  node.replaceChildren(fragment);
  searchMathStates.set(node, {});
  trackedSearchMath.add(node);
  return true;
}

function searchMathViewport(root) {
  var scrollwrap = root.querySelector(".md-search__scrollwrap");
  return scrollwrap ? scrollwrap.getBoundingClientRect() : null;
}

function visibleSearchMath(node, viewport) {
  if (!node.isConnected || node.closest("details:not([open])")) return false;
  var rect = node.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  // A small overscan prepares the next row without processing every hidden
  // result in a broad query. DOM insertion and typesetting stay off the input
  // critical path until a result is actually near the scrolling viewport.
  return !viewport || (
    viewport.width > 0 && viewport.height > 0 &&
    rect.bottom >= viewport.top - 96 && rect.top <= viewport.bottom + 96
  );
}

function typesetSearchMath(event) {
  var root = event.detail && event.detail.root;
  if (!root || !root.isConnected) return;
  // Material replaces result DOM on each query. Release just those removed
  // excerpts, without resetting the article's MathItems or equation counters.
  trackedSearchMath.forEach(function (node) { if (!node.isConnected) clearSearchMath(node); });
  // Material emits h1/h2 rather than a __title element. Read the combined text
  // so a formula split by keyword <mark> nodes is still recognized as one unit.
  var viewport = searchMathViewport(root);
  var nodes = Array.from(root.querySelectorAll(
    ".md-search-result__article p, .md-search-result__article h1, .md-search-result__article h2, .edwinos-search-provenance"
  ))
    .filter(function (node) { return visibleSearchMath(node, viewport); })
    .filter(prepareSearchMath)
    .map(function (node) { return { node: node, state: searchMathStates.get(node) }; });
  if (!nodes.length) return;
  loadMathJax().then(function () {
    typesetQueue = typesetQueue.catch(function () {}).then(function () {
      var currentViewport = searchMathViewport(root);
      var current = nodes.filter(function (item) {
        if (!item.node.isConnected || searchMathStates.get(item.node) !== item.state) return false;
        if (visibleSearchMath(item.node, currentViewport)) return true;
        // Scroll/query changes may happen while the lazy runtime is loading.
        // Keep unrendered TeX retryable when this row becomes visible again.
        clearSearchMath(item.node);
        return false;
      }).map(function (item) { return item.node; });
      if (!current.length) return;
      return window.MathJax.typesetPromise(current).then(function () {
        document.dispatchEvent(new CustomEvent("edwinos:search-math-settled", { detail: { root: root } }));
      });
    });
    typesetQueue.catch(function () {
      // Optional local runtime failures leave readable TeX and allow a retry.
      nodes.forEach(function (item) { if (searchMathStates.get(item.node) === item.state) clearSearchMath(item.node); });
    });
  }).catch(function () {
    nodes.forEach(function (item) { if (searchMathStates.get(item.node) === item.state) clearSearchMath(item.node); });
  });
}

window.EdwinOSSearchMath = {
  getRanges: searchMathRanges,
  prepare: prepareSearchMath,
  clear: clearSearchMath
};
document.addEventListener("edwinos:search-snippets-updated", typesetSearchMath);

// MkDocs Material 暴露 document$ Observable（基于 RxJS），
// 每次内容变更（含 instant navigation）都会触发。
if (window.document$ && typeof window.document$.subscribe === "function") {
  window.document$.subscribe(typesetCurrentDocument);
} else {
  document.addEventListener("DOMContentLoaded", typesetCurrentDocument);
}
})();
