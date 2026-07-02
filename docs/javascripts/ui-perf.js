/* Reserved for lightweight UI hooks. */
(function () {
  "use strict";

  function updateHomepageClass() {
    if (!document.body) return;

    var pathname = (window.location.pathname || "").replace(/\/+$/, "");
    var isByPath = pathname === "" || pathname === "/" || pathname.endsWith("/index.html");
    var isHomeProfilePage = /\/HOME\/(?:Archive|friends)(?:\/index\.html)?$/i.test(pathname);

    var logo = document.querySelector(".md-header__button.md-logo");
    var logoHref = logo ? (logo.getAttribute("href") || "").trim() : "";
    var isByLogo = logoHref === "." || logoHref === "./";

    var isHomepage = isByPath || isByLogo;
    document.body.classList.toggle("is-homepage", isHomepage);
    document.body.classList.toggle("is-home-profile-page", isHomeProfilePage);

    if (isHomepage) {
      document.title = "Chen Jing | Zhejiang University";
    }
  }

  function closeSearchWhenClickingAway() {
    document.addEventListener("click", function (event) {
      var searchToggle = document.querySelector('[data-md-toggle="search"]');
      if (!searchToggle || !searchToggle.checked) return;

      var target = event.target;
      var search = document.querySelector(".md-search");
      if (search && search.contains(target)) return;
      if (target.closest && target.closest('[for="__search"]')) return;

      searchToggle.checked = false;
      searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function setupSearchActivation() {
    var search = document.querySelector(".md-search");
    var input = search ? search.querySelector(".md-search__input") : null;
    var form = search ? search.querySelector(".md-search__form") : null;
    var searchToggle = document.querySelector('[data-md-toggle="search"]');

    if (!search || !input || !form || !searchToggle || search.dataset.edwinosSearchReady === "1") return;
    search.dataset.edwinosSearchReady = "1";

    var emitQuery = function () {
      input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Unidentified" }));
    };

    var scheduleQueryEmit = function () {
      if (!input.value.trim()) return;

      window.setTimeout(emitQuery, 40);
      window.setTimeout(emitQuery, 180);
      window.setTimeout(emitQuery, 520);
    };

    var openSearch = function () {
      if (!searchToggle.checked) {
        searchToggle.checked = true;
        searchToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }

      scheduleQueryEmit();
    };

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

    input.addEventListener("focus", openSearch);
    input.addEventListener("click", openSearch);
    input.addEventListener("input", openSearch);
    input.addEventListener("keydown", function (event) {
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

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      openSearch();
      updateSharedQuery();
      scheduleQueryEmit();
      input.focus();
    }, true);

    var params = new URLSearchParams(window.location.search);
    var sharedQuery = params.get("q") || params.get("query");
    if (sharedQuery && !input.value) {
      input.value = sharedQuery;
      window.requestAnimationFrame(function () {
        openSearch();
        scheduleQueryEmit();
      });
    }
  }

  function siteHref(relativePath) {
    var logo = document.querySelector(".md-header__button.md-logo");
    var logoHref = logo ? (logo.getAttribute("href") || "").trim() : "";
    var homeUrl = new URL(logoHref || "/", window.location.href);
    return new URL(relativePath, homeUrl).pathname;
  }

  var sourceFactsObserverStarted = false;

  function sourceFactMarkup() {
    return [
      '<ul class="md-source__facts" data-edwinos-source-facts="true">',
      '  <li class="md-source__fact" data-source-fact="stars">0</li>',
      '  <li class="md-source__fact" data-source-fact="forks">0</li>',
      '</ul>'
    ].join("");
  }

  function normalizeSourceFacts() {
    var sources = document.querySelectorAll(".md-header__source .md-source");
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
          fact.setAttribute("data-source-fact", index === 0 ? "stars" : "forks");
        });
      });
    });
  }

  function watchSourceFacts() {
    if (sourceFactsObserverStarted || !document.body) return;
    sourceFactsObserverStarted = true;

    var observer = new MutationObserver(function () {
      normalizeSourceFacts();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function profileSidebarHtml() {
    return [
      '<div class="profile-card">',
      '  <div class="profile-avatar">',
      '    <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Edwin&backgroundColor=f0f4f8" alt="Chen Jing">',
      '  </div>',
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
      '    <a href="https://www.facebook.com/profile.php?id=61578219971823" target="_blank" rel="noopener" title="Facebook" aria-label="Facebook"><svg class="social-icon" aria-hidden="true" viewBox="0 0 512 512"><path d="M512 256C512 114.6 397.4 0 256 0S0 114.6 0 256c0 120 82.7 220.8 194.2 248.5V334.2h-52.8V256h52.8v-33.7c0-87.1 39.4-127.5 125-127.5 16.2 0 44.2 3.2 55.7 6.4V172c-6-.6-16.5-1-29.6-1-42 0-58.2 15.9-58.2 57.2V256h83.6l-14.4 78.2H287v175.9C413.8 494.8 512 386.9 512 256"></path></svg></a>',
      '    <a href="https://www.instagram.com/edwinjing2025/" target="_blank" rel="noopener" title="Instagram" aria-label="Instagram"><svg class="social-icon" aria-hidden="true" viewBox="0 0 448 512"><path d="M224.3 141a115 115 0 1 0-.6 230 115 115 0 1 0 .6-230m-.6 40.4a74.6 74.6 0 1 1 .6 149.2 74.6 74.6 0 1 1-.6-149.2m93.4-45.1a26.8 26.8 0 1 1 53.6 0 26.8 26.8 0 1 1-53.6 0m129.7 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8M399 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1"></path></svg></a>',
      '    <a href="https://www.youtube.com/@EdwinJing" target="_blank" rel="noopener" title="YouTube" aria-label="YouTube"><svg class="social-icon" aria-hidden="true" viewBox="0 0 576 512"><path d="M549.7 124.1c-6.2-23.7-24.8-42.3-48.3-48.6C458.9 64 288.1 64 288.1 64S117.3 64 74.7 75.5c-23.5 6.3-42 24.9-48.3 48.6C15 167 15 256.4 15 256.4s0 89.4 11.4 132.3c6.3 23.6 24.8 41.5 48.3 47.8C117.3 448 288.1 448 288.1 448s170.8 0 213.4-11.5c23.5-6.3 42-24.2 48.3-47.8 11.4-42.9 11.4-132.3 11.4-132.3s0-89.4-11.4-132.3zM232.2 337.6V175.2l142.7 81.2z"></path></svg></a>',
      '    <a href="https://x.com/EdwinJing661" target="_blank" rel="noopener" title="Twitter/X" aria-label="Twitter/X"><svg class="social-icon" aria-hidden="true" viewBox="0 0 448 512"><path d="M357.2 48h70.6L273.6 224.2 455 464H313L201.7 318.6 74.5 464H3.8l164.9-188.5L-5.2 48h145.6l100.5 132.9zm-24.8 373.8h39.1L119.1 88h-42z"></path></svg></a>',
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
      timeElement.innerHTML = markup;
    });
  }

  function updateFriendCount() {
    var countElements = document.querySelectorAll("#friend-count");
    if (!countElements.length) return;

    function countRealFriends(markup) {
      var friendDoc = new DOMParser().parseFromString(markup, "text/html");
      return Array.prototype.filter.call(friendDoc.querySelectorAll(".friend-card[href]"), function (link) {
        var href = link.getAttribute("href") || "";
        return !/^https?:\/\/example\d*\.com\/?/i.test(href);
      }).length;
    }

    fetch(siteHref("HOME/friends/"), { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("Unable to fetch friend page");
        return response.text();
      })
      .then(function (markup) {
        var friendCount = countRealFriends(markup);
        if (friendCount < 1) return;
        countElements.forEach(function (countElement) {
          countElement.textContent = String(friendCount);
        });
      })
      .catch(function () {
        // Keep the inline fallback when the page is not available.
      });
  }

  function visitorFallbackMarkup(state) {
    var title = state === "failed" ? "Visitor map unavailable" : "Visitor map loading";
    var meta = state === "failed"
      ? "Please view with a VPN."
      : "The page remains ready while the external map responds.";

    return [
      '<div class="visitor-fallback">',
      '  <span class="visitor-fallback__eyebrow">Global Footprints</span>',
      '  <span class="visitor-fallback__title">' + title + '</span>',
      '  <span class="visitor-fallback__meta">' + meta + '</span>',
      '</div>'
    ].join("");
  }

  function visitorContentWidth(container) {
    var style = window.getComputedStyle(container);
    var paddingLeft = parseFloat(style.paddingLeft) || 0;
    var paddingRight = parseFloat(style.paddingRight) || 0;
    var width = container.clientWidth - paddingLeft - paddingRight;

    return Math.max(180, Math.round(width || container.clientWidth || 300));
  }

  function visitorAssetWidth(displayWidth) {
    return Math.min(1200, Math.max(300, Math.round(displayWidth || 300)));
  }

  function visitorBackgroundUrl(map) {
    if (!map) return "";

    var backgroundImage = map.style.backgroundImage || window.getComputedStyle(map).backgroundImage || "";
    var match = backgroundImage.match(/url\((['"]?)(.*?)\1\)/);
    return match ? match[2] : "";
  }

  function visitorSizedBackgroundUrl(url, width) {
    if (!url || !width) return url;

    return url.replace(/bg-w_[^-/.?]+/, "bg-w_" + width);
  }

  function setVisitorBackgroundUrl(map, url) {
    if (!map || !url) return;

    map.style.backgroundImage = 'url("' + url.replace(/"/g, '\\"') + '")';
  }

  function normalizeVisitorMapSize(container) {
    var widget = container.querySelector("#mapmyvisitors-widget");
    var map = container.querySelector(".mapmyvisitors-map");
    if (!widget || !map) return "";

    var width = visitorContentWidth(container);
    var height = Math.round(width / 2.04);
    var assetWidth = visitorAssetWidth(width);

    widget.style.width = width + "px";
    map.style.width = width + "px";
    map.style.height = height + "px";
    map.style.backgroundPosition = "center center";
    map.style.backgroundRepeat = "no-repeat";
    map.style.backgroundSize = "100% 100%";

    var backgroundUrl = visitorBackgroundUrl(map);
    var sizedBackgroundUrl = visitorSizedBackgroundUrl(backgroundUrl, assetWidth);
    if (sizedBackgroundUrl && sizedBackgroundUrl !== backgroundUrl) {
      setVisitorBackgroundUrl(map, sizedBackgroundUrl);
      backgroundUrl = sizedBackgroundUrl;
    }

    return backgroundUrl;
  }

  function visitorMapHasData(container) {
    var text = (container.textContent || "").replace(/\s+/g, " ").trim();
    if (/Loading data/i.test(text)) return false;
    if (/Total Pageviews|Pageviews/i.test(text)) return true;

    return !!container.querySelector("#mapmyvisitors-widget .jvectormap-container svg");
  }

  function nudgeVisitorMapSize() {
    var trigger = function () {
      window.dispatchEvent(new Event("resize"));
    };

    if (window.requestAnimationFrame) {
      window.requestAnimationFrame(trigger);
      return;
    }

    window.setTimeout(trigger, 0);
  }

  function startVisitorMapLoad(container) {
    if (!container || container.dataset.visitorMapState === "loaded") return;
    if (container.dataset.visitorMapState === "loading") return;

    var mapSrc = container.getAttribute("data-map-src");
    if (!mapSrc) return;

    container.dataset.visitorMapState = "loading";
    container.innerHTML = visitorFallbackMarkup("loading");

    var script = document.createElement("script");
    script.type = "text/javascript";
    script.id = "mapmyvisitors";
    script.async = true;
    script.src = mapSrc;

    var observer;
    var timeout;
    var settled = false;
    var pendingBackgroundUrl = "";
    var loadedBackgroundUrl = "";

    var fail = function () {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (observer) observer.disconnect();
      container.dataset.visitorMapState = "failed";
      container.innerHTML = visitorFallbackMarkup("failed");
    };

    var markLoaded = function () {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      if (observer) observer.disconnect();
      container.dataset.visitorMapState = "loaded";
      var fallback = container.querySelector(".visitor-fallback");
      if (fallback) fallback.remove();
      normalizeVisitorMapSize(container);
      nudgeVisitorMapSize();
    };

    var verifyVisitorBackground = function (backgroundUrl) {
      if (!backgroundUrl) return;
      if (backgroundUrl === loadedBackgroundUrl) {
        markLoaded();
        return;
      }
      if (backgroundUrl === pendingBackgroundUrl) return;

      pendingBackgroundUrl = backgroundUrl;

      var image = new Image();
      image.onload = function () {
        if (settled || pendingBackgroundUrl !== backgroundUrl) return;

        if (image.naturalWidth > 1 && image.naturalHeight > 1) {
          loadedBackgroundUrl = backgroundUrl;
          markLoaded();
          return;
        }

        fail();
      };
      image.onerror = fail;
      image.src = new URL(backgroundUrl, window.location.href).href;
    };

    var markLoadedIfReady = function () {
      if (!visitorMapHasData(container)) return;
      verifyVisitorBackground(normalizeVisitorMapSize(container));
    };

    observer = new MutationObserver(markLoadedIfReady);
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });

    timeout = window.setTimeout(fail, 22000);

    script.addEventListener("load", function () {
      var fallback = container.querySelector(".visitor-fallback");
      if (fallback) fallback.remove();
      nudgeVisitorMapSize();
      window.setTimeout(markLoadedIfReady, 250);
    });

    script.addEventListener("error", function () {
      window.clearTimeout(timeout);
      fail();
    });

    container.appendChild(script);
  }

  function afterWindowLoad(callback) {
    var run = function () {
      window.setTimeout(callback, 900);
    };

    if (document.readyState === "complete") {
      run();
      return;
    }

    window.addEventListener("load", run, { once: true });
  }

  function setupVisitorMap() {
    var containers = document.querySelectorAll("[data-visitor-map]");
    if (!containers.length) return;

    containers.forEach(function (container) {
      if (container.dataset.visitorMapObserved === "1") return;
      container.dataset.visitorMapObserved = "1";
      container.dataset.visitorMapState = container.dataset.visitorMapState || "idle";

      var scheduleLoad = function () {
        afterWindowLoad(function () {
          startVisitorMapLoad(container);
        });
      };

      if ("IntersectionObserver" in window) {
        var observer = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            observer.disconnect();
            scheduleLoad();
          });
        }, { rootMargin: "220px 0px" });
        observer.observe(container);
      } else {
        scheduleLoad();
      }
    });
  }

  function ensureHomeProfileLayout() {
    var pathname = (window.location.pathname || "").replace(/\/+$/, "");
    var shouldUseProfileShell = /\/HOME\/(?:Archive|friends)(?:\/index\.html)?$/i.test(pathname);
    if (!shouldUseProfileShell) return;

    var contentInner = document.querySelector(".md-content__inner");
    if (!contentInner) return;

    if (contentInner.querySelector(".academic-home-layout--subpage")) {
      updateBeijingTime();
      updateFriendCount();
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
    updateFriendCount();
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
    normalizeSourceFacts();
    watchSourceFacts();
    ensureHomeProfileLayout();
    updateBeijingTime();
    updateFriendCount();
    setupSearchActivation();
    setupVisitorMap();
    fixOrderedListContinuity();
  }

  runAll();
  closeSearchWhenClickingAway();
  setInterval(updateBeijingTime, 1000);

  document.addEventListener("DOMContentLoaded", runAll);

  // MkDocs Material instant navigation support.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(runAll);
  }
})();
