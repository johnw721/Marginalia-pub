// lib/extraction/strategies/structured.js — StructuredStrategy
//
// CSS-selector-based extraction for read-later platforms (Pocket, Instapaper,
// Matter, Readwise Reader, Omnivore) where the app has already produced a clean
// reader view, making hand-authored selectors more precise than Readability.js's
// general-purpose heuristics.
//
// Resolution order:
//   1. Platform-specific CSS selectors (highest fidelity).
//      Selectors are listed broadest-to-narrowest per platform; the first that
//      returns > 100 characters of text wins.
//   2. Readability.js on a document clone (same vendor library as ReadabilityStrategy).
//   3. Filtered innerText fallback (strip NAV/FOOTER/ASIDE/HEADER/SCRIPT/STYLE).
//
// Also extracts the canonical / og:url source URL where available, so the
// READING_CHUNK reflects the original article URL (e.g. nytimes.com/…) rather
// than the read-later app's reader URL (e.g. app.getpocket.com/read/…).
//
// Attaches: window.RC.StructuredStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  const MAX_TEXT_LENGTH = 8000;

  // ── Per-platform selector configuration ──────────────────────────────────
  //
  // Each entry maps a hostname to an ordered list of CSS selectors targeting
  // the article body.  Selectors use [class*="..."] patterns where possible to
  // survive minor class-name changes across app updates.
  //
  // Add new platforms here — no other code changes required.

  const PLATFORM_CONFIG = {
    "app.getpocket.com": [
      "[data-testid='story-text']",
      "[class*='storyText']",
      "[class*='reader__content']",
      "[class*='Reader_text']",
      ".article-inner",
      ".pocket-reader-article",
    ],
    "www.instapaper.com": [
      "#article-body",
      ".text",
      "[class*='article-text']",
      "[class*='articleBody']",
    ],
    "hq.getmatter.com": [
      "[data-testid='article-body']",
      "[class*='articleBody']",
      "[class*='ArticleBody']",
      "[class*='reader__content']",
      "[class*='readerContent']",
    ],
    "read.readwise.io": [
      "[data-testid='document-text']",
      "[class*='DocumentText']",
      "[class*='documentText']",
      "[class*='readerDocumentText']",
      "[class*='Reader_document']",
      "[class*='reader-document']",
    ],
    "app.readwise.io": [
      "[data-testid='document-text']",
      "[class*='DocumentText']",
      "[class*='documentText']",
      "[class*='Reader_document']",
    ],
    "omnivore.app": [
      "[data-testid='article-content']",
      "[class*='articleContainer']",
      "[class*='articleContent']",
      "[class*='article-content']",
      "[class*='reader-article']",
    ],
  };

  // Tags stripped in the innerText fallback (same as ReadabilityStrategy).
  const SKIP_TAGS = ["NAV", "FOOTER", "ASIDE", "HEADER", "SCRIPT", "STYLE"];

  // Minimum characters for a selector match to be considered useful.
  const MIN_SELECTOR_CHARS = 100;

  // ── StructuredStrategy ────────────────────────────────────────────────────

  function StructuredStrategy() {
    this.id = "structured";
  }

  /**
   * Returns true on known read-later app domains.
   * The factory in lib/extraction/index.js falls back to ReadabilityStrategy
   * on any domain not in PLATFORM_CONFIG.
   *
   * @returns {boolean}
   */
  StructuredStrategy.prototype.canHandle = function () {
    var hostname = location.hostname;
    var domains  = Object.keys(PLATFORM_CONFIG);
    for (var i = 0; i < domains.length; i++) {
      var d = domains[i];
      if (hostname === d || hostname.endsWith("." + d)) return true;
    }
    return false;
  };

  /**
   * Extracts article text using the three-stage resolution order described
   * at the top of this file.
   *
   * @returns {Promise<ExtractionResult>}
   */
  StructuredStrategy.prototype.extract = async function () {
    var url       = location.href;
    var title     = document.title || "";
    var timestamp = Date.now();

    // Prefer the original article URL over the reader-app wrapper URL.
    var sourceUrl = this._findSourceUrl() || url;

    // ── Stage 1: platform-specific CSS selectors ──────────────────────────
    var selectorResult = this._tryPlatformSelectors(sourceUrl, title, timestamp);
    if (selectorResult.success) {
      console.debug("[RC structured] extracted via selector — chars:", selectorResult.text.length);
      return selectorResult;
    }

    // ── Stage 2: Readability.js ───────────────────────────────────────────
    if (typeof Readability !== "undefined") {
      try {
        var docClone = document.cloneNode(true);
        var reader   = new Readability(docClone);
        var article  = reader.parse();

        if (article && article.textContent && article.textContent.trim().length > 0) {
          var raw = article.textContent.trim().slice(0, MAX_TEXT_LENGTH);
          console.debug("[RC structured] extracted via Readability — chars:", raw.length);
          return {
            text:      raw,
            title:     article.title || title,
            url:       sourceUrl,
            timestamp: timestamp,
            wordCount: _countWords(raw),
            strategy:  "structured",
            success:   true,
            error:     null,
          };
        }
      } catch (err) {
        console.warn("[RC structured] Readability fallback failed:", err.message);
      }
    }

    // ── Stage 3: filtered innerText ───────────────────────────────────────
    console.debug("[RC structured] falling back to innerText");
    return this._innerTextFallback(sourceUrl, title, timestamp);
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Tries to find the original article URL embedded in the page.
   * Read-later apps typically set a canonical link or og:url pointing to the
   * source article so the reading companion can reference it in conversation.
   *
   * Ignores same-host URLs (those are just the reader app itself).
   *
   * @returns {string|null}
   */
  StructuredStrategy.prototype._findSourceUrl = function () {
    // <link rel="canonical">
    var canonical = document.querySelector("link[rel='canonical']");
    if (canonical && canonical.href) {
      try {
        var canonicalHost = new URL(canonical.href).hostname;
        if (canonicalHost && canonicalHost !== location.hostname) {
          return canonical.href;
        }
      } catch (_) {}
    }

    // <meta property="og:url">
    var ogUrl = document.querySelector("meta[property='og:url']");
    if (ogUrl && ogUrl.content) {
      try {
        var ogHost = new URL(ogUrl.content).hostname;
        if (ogHost && ogHost !== location.hostname) {
          return ogUrl.content;
        }
      } catch (_) {}
    }

    return null;
  };

  /**
   * Tries each CSS selector for the current platform in order.
   * Returns the first result with sufficient text.
   *
   * @param {string} url
   * @param {string} title
   * @param {number} timestamp
   * @returns {ExtractionResult}
   */
  StructuredStrategy.prototype._tryPlatformSelectors = function (url, title, timestamp) {
    var hostname = location.hostname;
    var selectors = null;

    var domains = Object.keys(PLATFORM_CONFIG);
    for (var i = 0; i < domains.length; i++) {
      var d = domains[i];
      if (hostname === d || hostname.endsWith("." + d)) {
        selectors = PLATFORM_CONFIG[d];
        break;
      }
    }

    if (!selectors) {
      return { success: false, text: "", title: title, url: url, timestamp: timestamp,
               wordCount: 0, strategy: "structured", error: "no_platform_config" };
    }

    for (var j = 0; j < selectors.length; j++) {
      try {
        var el = document.querySelector(selectors[j]);
        if (!el) continue;

        var raw = (el.innerText || el.textContent || "").trim();
        if (raw.length < MIN_SELECTOR_CHARS) continue;

        var text = raw.slice(0, MAX_TEXT_LENGTH);
        return {
          text:      text,
          title:     title,
          url:       url,
          timestamp: timestamp,
          wordCount: _countWords(text),
          strategy:  "structured",
          success:   true,
          error:     null,
        };
      } catch (err) {
        console.warn("[RC structured] selector error (" + selectors[j] + "):", err.message);
      }
    }

    return { success: false, text: "", title: title, url: url, timestamp: timestamp,
             wordCount: 0, strategy: "structured", error: "no_selector_matched" };
  };

  /**
   * Filtered innerText fallback — strips structural tags, reads bodyClone.innerText.
   * Same approach as ReadabilityStrategy._innerTextFallback.
   *
   * @param {string} url
   * @param {string} title
   * @param {number} timestamp
   * @returns {ExtractionResult}
   */
  StructuredStrategy.prototype._innerTextFallback = function (url, title, timestamp) {
    try {
      var bodyClone = document.body.cloneNode(true);
      SKIP_TAGS.forEach(function (tag) {
        bodyClone.querySelectorAll(tag).forEach(function (el) { el.remove(); });
      });

      var raw  = (bodyClone.innerText || bodyClone.textContent || "").trim();
      var text = raw.slice(0, MAX_TEXT_LENGTH);

      return {
        text:      text,
        title:     title,
        url:       url,
        timestamp: timestamp,
        wordCount: _countWords(text),
        strategy:  "structured-fallback",
        success:   text.length > 0,
        error:     text.length === 0 ? "no_content" : null,
      };
    } catch (err) {
      return {
        text: "", title: title, url: url, timestamp: timestamp,
        wordCount: 0, strategy: "structured-fallback", success: false, error: err.message,
      };
    }
  };

  // ── Module helper ─────────────────────────────────────────────────────────

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length;
  }

  window.RC.StructuredStrategy = StructuredStrategy;
})();
