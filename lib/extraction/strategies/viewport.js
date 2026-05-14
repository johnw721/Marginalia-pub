// lib/extraction/strategies/viewport.js — ViewportStrategy
//
// Extracts only the text elements that the user has actually scrolled over,
// rather than the full article DOM. Elements are tracked via IntersectionObserver
// from the moment this script loads, so the accumulated set grows as the user reads.
//
// Intended for users on heterogeneous sources — SPAs, paywalled pages, feeds,
// multi-panel UIs — where Readability over-extracts or fails entirely.
//
// Architecture:
//   Module-level observers accumulate seen elements for the lifetime of the page.
//   ViewportStrategy instances are thin read-windows into that shared state.
//   This is intentional: getStrategy() creates a new instance per extraction call,
//   but the observation data must persist across those calls.
//
// Attaches: window.RC.ViewportStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  // ── Constants ─────────────────────────────────────────────────────────────

  // Elements worth capturing. Ordered from most to least specific.
  var SELECTOR = [
    "p", "h1", "h2", "h3", "h4", "h5", "h6",
    "li", "blockquote", "figcaption", "td", "th",
  ].join(", ");

  // Minimum text length for an element to count as content.
  var MIN_CHARS = 20;

  // Intersection threshold: element must be at least 25% inside the viewport
  // to be considered "seen". Lower = more permissive, higher = stricter.
  var INTERSECTION_THRESHOLD = 0.25;

  // Main-content selectors used by the fallback path.
  var MAIN_SELECTORS = [
    "main", "article", "[role='main']",
    ".post-content", ".article-body", ".entry-content",
    ".story-body", ".article-content", ".content",
  ].join(", ");

  // ── Module-level observation state ────────────────────────────────────────
  //
  // These variables persist for the page lifetime. They are reset when a SPA
  // navigation is detected inside extract() or when _init() is called again.

  var _seenElements = new Set();   // elements that have been in the viewport
  var _io           = null;        // IntersectionObserver
  var _mo           = null;        // MutationObserver (infinite scroll / SPA)
  var _observedUrl  = "";          // URL at the time _init() was last called

  // ── Observer setup ────────────────────────────────────────────────────────

  function _observeEl(el) {
    if (!_io || !el || !el.tagName) return;
    try { _io.observe(el); } catch (_) {}
  }

  function _observeTree(root) {
    if (!root || !root.querySelectorAll) return;
    var els = root.querySelectorAll(SELECTOR);
    for (var i = 0; i < els.length; i++) _observeEl(els[i]);
    // Also check if the root itself matches (e.g. a freshly added <p>)
    if (root.matches) {
      try { if (root.matches(SELECTOR)) _observeEl(root); } catch (_) {}
    }
  }

  function _init() {
    // Tear down existing observers before re-initialising.
    if (_io) _io.disconnect();
    if (_mo) _mo.disconnect();
    _seenElements.clear();
    _observedUrl = location.href;

    // IntersectionObserver — fires whenever an element enters / leaves viewport.
    _io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i];
        if (entry.isIntersecting && entry.intersectionRatio >= INTERSECTION_THRESHOLD) {
          _seenElements.add(entry.target);
        }
      }
    }, { threshold: INTERSECTION_THRESHOLD });

    // Observe all matching elements currently in the DOM.
    var body = document.body || document.documentElement;
    _observeTree(body);

    // MutationObserver — watches for new elements (infinite scroll, SPA content injection).
    _mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue; // skip text / comment nodes
          _observeTree(node);
        }
      }
    });

    _mo.observe(body, { childList: true, subtree: true });
  }

  // Boot immediately; defer to DOMContentLoaded if body is not yet available.
  if (document.body) {
    _init();
  } else {
    document.addEventListener("DOMContentLoaded", _init, { once: true });
  }

  // ── ViewportStrategy ──────────────────────────────────────────────────────

  function ViewportStrategy() {
    this.id = "viewport";
  }

  /**
   * Always returns true — any page can use viewport-based extraction.
   * The factory in lib/extraction/index.js will select this strategy when
   * the user has chosen "viewport" in onboarding.
   *
   * @returns {boolean}
   */
  ViewportStrategy.prototype.canHandle = function () {
    return true;
  };

  /**
   * Collects text from all elements that have appeared in the viewport since
   * the page loaded (or since the last SPA navigation).
   *
   * Steps:
   *   1. Detect SPA navigation — re-init observers if the URL has changed.
   *   2. Snap any currently-visible elements not yet in _seenElements.
   *   3. Filter to leaf elements (no parent-child duplicates).
   *   4. Sort in DOM order and join text.
   *   5. Fallback: if nothing was seen, use the first 5 elements from the
   *      main content column.
   *
   * @returns {Promise<ExtractionResult>}
   */
  ViewportStrategy.prototype.extract = async function () {

    // 1. SPA navigation detection — reset and re-observe if URL changed.
    if (location.href !== _observedUrl) {
      _init();
      // Give the IntersectionObserver a short settle window so initially-visible
      // elements (above the fold) are captured before we read _seenElements.
      await new Promise(function (resolve) { setTimeout(resolve, 250); });
    }

    // 2. Snap any currently-visible elements not yet in _seenElements.
    //    This catches elements that loaded after the IO fired (lazy images,
    //    client-rendered content) and anything visible right now.
    var candidates = document.querySelectorAll(SELECTOR);
    for (var i = 0; i < candidates.length; i++) {
      var el   = candidates[i];
      var rect = el.getBoundingClientRect();
      // Element is in the viewport if any part of it is between top and bottom.
      if (rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0) {
        _seenElements.add(el);
      }
    }

    // 3. Filter to leaf elements — if both a parent and a child are in the set,
    //    keep only the child to avoid duplicating the same text.
    var arr    = Array.from(_seenElements);
    var leaves = arr.filter(function (el) {
      return !arr.some(function (other) {
        return other !== el && el.contains(other);
      });
    });

    // 4. Sort in DOM order (compareDocumentPosition returns a bitmask).
    leaves.sort(function (a, b) {
      var rel = a.compareDocumentPosition(b);
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (rel & Node.DOCUMENT_POSITION_PRECEDING)  return  1;
      return 0;
    });

    // Extract and filter text.
    var textParts = leaves
      .map(function (el) { return (el.innerText || el.textContent || "").trim(); })
      .filter(function (t) { return t.length >= MIN_CHARS; });

    // 5. Fallback — if nothing was captured, use the first 5 elements from the
    //    main content column. This covers pages where the user opened the
    //    sidebar without scrolling (e.g. short articles fully above the fold).
    if (textParts.length === 0) {
      var mainEl = document.querySelector(MAIN_SELECTORS) || document.body;
      var fallbackEls = mainEl.querySelectorAll(SELECTOR);
      textParts = Array.from(fallbackEls)
        .slice(0, 5)
        .map(function (el) { return (el.innerText || el.textContent || "").trim(); })
        .filter(function (t) { return t.length >= MIN_CHARS; });
    }

    var text      = textParts.join("\n\n");
    var wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

    return {
      text:      text,
      title:     document.title || "",
      url:       location.href,
      timestamp: Date.now(),
      wordCount: wordCount,
      strategy:  "viewport",
      success:   text.length > 0,
      error:     text.length === 0 ? "No visible content detected" : undefined,
    };
  };

  window.RC.ViewportStrategy = ViewportStrategy;

  console.debug("[RC viewport] observers active — url:", location.href);
})();
