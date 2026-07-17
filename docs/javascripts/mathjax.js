/* ==============================================================================
 * MathJax 3 配置 + TOC 渲染补丁
 *
 * 默认 pymdownx.arithmatex (generic: true) 只在正文标题中插入
 *   <span class="arithmatex">\(...\)</span>
 * 而右侧目录 (TOC) 中只有 .md-ellipsis 里的纯文本 "\(sp^3\)"
 * MathJax 因 ignoreHtmlClass=".*|" + processHtmlClass="arithmatex" 默认跳过 TOC
 *
 * 解决方案：
 * 1. 在 typeset 之前，扫描 TOC 中的 .md-ellipsis，把任何含 \(...\) 的文本
 *    重新包裹为 <span class="arithmatex">...</span>，让 MathJax 接管渲染。
 * 2. 同时显式调用 typesetPromise 处理整个文档。
 * ============================================================================== */
(function () {
  "use strict";

  var MATHJAX_SRC = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
  var mathJaxLoadPromise = null;
  var navigationSequence = 0;
  var typesetQueue = Promise.resolve();

  window.MathJax = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [["\\[", "\\]"]],
      processEscapes: true,
      processEnvironments: true
    },
    options: {
      ignoreHtmlClass: ".*|",
      processHtmlClass: "arithmatex"
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

        wrapTocMath();
        window.MathJax.typesetClear();
        window.MathJax.texReset();
        return window.MathJax.typesetPromise();
      });

    // Always attach a rejection handler: CDN and rapid-navigation failures must
    // not surface as uncaught promise rejections.
    typesetQueue.catch(function () {
      // A later document$ emission can safely retry the lifecycle.
    });
  }).catch(function () {
    // Keep raw TeX readable when the optional CDN dependency is unavailable.
  });
}

// MkDocs Material 暴露 document$ Observable（基于 RxJS），
// 每次内容变更（含 instant navigation）都会触发。
if (window.document$ && typeof window.document$.subscribe === "function") {
  window.document$.subscribe(typesetCurrentDocument);
} else {
  document.addEventListener("DOMContentLoaded", typesetCurrentDocument);
}
})();
