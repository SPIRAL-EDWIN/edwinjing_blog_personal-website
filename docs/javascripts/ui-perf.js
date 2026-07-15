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
      document.title = "Chen Jing (经宸) | Zhejiang University";
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

  var sourceFactsObserverStarted = false;
  var sourceFactsRequestStarted = false;
  var latestSourceFacts = null;

  function sourceFactMarkup() {
    return [
      '<ul class="md-source__facts" data-edwinos-source-facts="true">',
      '  <li class="md-source__fact" data-source-fact="stars">0</li>',
      '  <li class="md-source__fact" data-source-fact="forks">0</li>',
      '</ul>'
    ].join("");
  }

  function formatSourceFactCount(value) {
    var count = Number(value);
    if (!Number.isFinite(count) || count < 0) return "0";
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

  function sourceApiUrl() {
    var source = document.querySelector(".md-header__source .md-source");
    var href = source ? source.getAttribute("href") : "";
    if (!href) return "";

    try {
      var url = new URL(href, window.location.href);
      if (url.hostname !== "github.com") return "";
      var parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length < 2) return "";
      return "https://api.github.com/repos/" + encodeURIComponent(parts[0]) + "/" + encodeURIComponent(parts[1]);
    } catch (error) {
      return "";
    }
  }

  function updateSourceFactsFromGitHub() {
    normalizeSourceFacts();
    applySourceFacts();

    if (sourceFactsRequestStarted) return;

    var apiUrl = sourceApiUrl();
    if (!apiUrl) return;
    sourceFactsRequestStarted = true;

    fetch(apiUrl, {
      cache: "no-cache",
      headers: { "Accept": "application/vnd.github+json" }
    })
      .then(function (response) {
        if (!response.ok) throw new Error("GitHub API unavailable");
        return response.json();
      })
      .then(function (data) {
        latestSourceFacts = {
          stars: data.stargazers_count,
          forks: data.forks_count
        };
        applySourceFacts();
      })
      .catch(function () {
        sourceFactsRequestStarted = false;
      });
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
    applySourceFacts();
  }

  function watchSourceFacts() {
    if (sourceFactsObserverStarted || !document.body) return;
    sourceFactsObserverStarted = true;

    var observer = new MutationObserver(function () {
      normalizeSourceFacts();
      applySourceFacts();
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
      '    <img src="https://api.dicebear.com/7.x/notionists/svg?seed=Edwin&backgroundColor=f0f4f8" alt="Chen Jing (经宸)">',
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

  function updateVisitorDeploymentTime() {
    var containers = document.querySelectorAll("[data-visitor-deployment]");
    if (!containers.length || visitorDeploymentRequestStarted) return;

    var apiUrl = visitorDeploymentApiUrl(containers[0]);
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

        containers.forEach(function (container) {
          var time = container.querySelector("[data-visitor-deployment-time]");
          if (!time) return;
          time.dateTime = latestSuccessfulRun.updated_at;
          time.textContent = "Latest updated " + displayMonth;
          time.title = "Last successful GitHub Pages deployment: " + new Date(latestSuccessfulRun.updated_at).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "Asia/Shanghai"
          }) + " (UTC+8)";
        });
      })
      .catch(function () {
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

  function setOsdNotesNavigationDepth() {
    var pathname = (window.location.pathname || "").replace(/\/index\.html$/i, "/");
    if (!/^\/OsdNotes(?:\/|$)/i.test(pathname)) return;

    var primaryNav = document.querySelector(".md-sidebar--primary .md-nav--primary");
    if (!primaryNav) return;

    var osdRootLink = Array.prototype.find.call(
      primaryNav.querySelectorAll("a.md-nav__link[href]"),
      function (link) {
        try {
          return new URL(link.getAttribute("href"), window.location.href).pathname
            .replace(/\/index\.html$/i, "/") === "/OsdNotes/";
        } catch (error) {
          return false;
        }
      }
    );
    if (!osdRootLink) return;

    var osdRootItem = osdRootLink.closest(".md-nav__item");
    var osdNav = osdRootItem && Array.prototype.find.call(osdRootItem.children, function (child) {
      return child.classList && child.classList.contains("md-nav");
    });
    if (!osdNav) return;

    var topLevelList = Array.prototype.find.call(osdNav.children, function (child) {
      return child.classList && child.classList.contains("md-nav__list");
    });
    if (!topLevelList) return;

    Array.prototype.forEach.call(topLevelList.children, function (item) {
      var toggle = Array.prototype.find.call(item.children, function (child) {
        return child.matches && child.matches("input.md-nav__toggle");
      });
      if (toggle) toggle.checked = true;
    });
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

    var BRIDGE_SELECTORS = [
      ".admonition",   // pymdownx admonition / mkdocs-callouts output
      "blockquote",    // raw blockquote (Obsidian callouts before plugin)
      "details",       // collapsible admonitions
      ".highlight",    // fenced code block with syntax highlighting
      "pre"            // fenced code block without a highlight wrapper
    ];

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
    normalizePaletteButtons();
    updateSourceFactsFromGitHub();
    watchSourceFacts();
    ensureHomeProfileLayout();
    updateBeijingTime();
    updateFriendCount();
    setupSearchActivation();
    markProfileDrawerEntries();
    setOsdNotesNavigationDepth();
    openExternalContentLinksInNewTabs();
    labelCodeBlockLanguages();
    setupVisitorBadge();
    updateVisitorDeploymentTime();
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
