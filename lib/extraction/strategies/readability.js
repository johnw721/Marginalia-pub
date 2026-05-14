// lib/extraction/strategies/readability.js
// Implements ExtractionStrategy using Mozilla's Readability.js.
//
// Extraction pipeline (four stages, tried in order until one succeeds):
//
//   0. Pre-process  — clone the document; strip paywall/modal overlays from the
//                     clone before running any text extraction.
//
//   1. Primary      — Readability.js on the cleaned clone.
//                     Succeeds when textContent ≥ 200 chars AND isPaywallText()
//                     returns false.
//
//   2. Fallback A   — Find <article> or <main> in the live DOM (read-only) and
//                     extract innerText.  Handles pages where Readability fails
//                     but the content is in a semantic landmark element.
//
//   3. Fallback B   — Collect the first 3 visible <p> elements (checked via
//                     getBoundingClientRect) and join their innerText.
//
//   4. Fallback C   — Strip NAV/FOOTER/ASIDE/HEADER/SCRIPT/STYLE from a body
//                     clone and read innerText.  Broad sweep; catches anything
//                     the more targeted fallbacks missed.
//
//   5. Final        — Return { success: false, error: "unable to extract" }.
//
// DOM safety: the original page is never permanently modified.  All mutations
// happen on document.cloneNode(true) or on element clones.
//
// Requires: vendor/Readability.js loaded before this file (sets global Readability).
// Requires: lib/extraction/quality.js loaded before this file (window.RC.isPaywallText).
// Attaches: window.RC.ReadabilityStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  const MAX_TEXT_LENGTH = 8000;

  // Minimum textContent length for the Readability primary path.
  // < 200 chars typically means a paywall intercept or near-blank page.
  const MIN_READABILITY_CHARS = 200;

  // Minimum chars for the article/main fallback path.
  const MIN_FALLBACK_A_CHARS  = 200;

  // Minimum chars for the visible-<p> fallback path.
  const MIN_FALLBACK_B_CHARS  = 100;

  // Tags stripped in Fallback C.
  const SKIP_TAGS = ["NAV", "FOOTER", "ASIDE", "HEADER", "SCRIPT", "STYLE"];

  // CSS class-name fragments used to identify paywall / modal overlays.
  // Matched with [class*="…"] so minor naming variations are covered.
  const PAYWALL_CLASS_PATTERNS = [
    "modal", "paywall", "gate", "intercept", "overlay",
    "cookie-banner", "cookie-consent", "consent-banner",
    "subscribe-wall", "subscription-wall",
  ];

  // ── ReadabilityStrategy ───────────────────────────────────────────────────

  function ReadabilityStrategy() {
    this.id = "readability";
  }

  /**
   * Returns true when the Readability constructor is available in the global
   * scope.  If Readability.js failed to load this returns false and the factory
   * in index.js will not select this strategy.
   *
   * @returns {boolean}
   */
  ReadabilityStrategy.prototype.canHandle = function () {
    return typeof Readability !== "undefined";
  };

  /**
   * Runs the four-stage extraction pipeline described at the top of this file.
   *
   * @returns {Promise<ExtractionResult>}
   */
  ReadabilityStrategy.prototype.extract = async function () {
    const url       = location.href;
    const title     = document.title || "";
    const timestamp = Date.now();

    // ── Stage 0: build a cleaned clone ─────────────────────────────────────
    //
    // All mutation happens on this clone so the live DOM is never touched.
    let cleanClone;
    try {
      cleanClone = document.cloneNode(true);
      _removePaywallModals(cleanClone);
    } catch (err) {
      console.warn("[RC readability] clone/strip failed:", err.message);
      cleanClone = null;
    }

    // ── Stage 1: Readability.js ─────────────────────────────────────────────
    if (this.canHandle() && cleanClone) {
      try {
        const reader  = new Readability(cleanClone);
        const article = reader.parse();

        if (article && article.textContent) {
          const raw = article.textContent.trim();

          if (raw.length >= MIN_READABILITY_CHARS) {
            const isPaywall = window.RC.isPaywallText && window.RC.isPaywallText(raw);

            if (!isPaywall) {
              console.debug("[RC readability] stage 1 (Readability) succeeded — chars:", raw.length);
              const text = raw.slice(0, MAX_TEXT_LENGTH);
              return {
                text,
                title: article.title || title,
                url, timestamp,
                wordCount: _countWords(text),
                strategy:  "readability",
                success:   true,
                error:     null,
              };
            }
            console.debug("[RC readability] stage 1 paywall detected — trying fallbacks");
          } else {
            console.debug("[RC readability] stage 1 too short (" + raw.length + " chars) — trying fallbacks");
          }
        }
      } catch (err) {
        console.warn("[RC readability] Readability.js threw:", err.message);
      }
    }

    // ── Stage 2: <article> / <main> innerText ──────────────────────────────
    try {
      const landmarkEl = document.querySelector("article, main");
      if (landmarkEl) {
        const raw = (landmarkEl.innerText || landmarkEl.textContent || "").trim();
        if (raw.length >= MIN_FALLBACK_A_CHARS) {
          const isPaywall = window.RC.isPaywallText && window.RC.isPaywallText(raw);
          if (!isPaywall) {
            console.debug("[RC readability] stage 2 (article/main) succeeded — chars:", raw.length);
            const text = raw.slice(0, MAX_TEXT_LENGTH);
            return {
              text,
              title, url, timestamp,
              wordCount: _countWords(text),
              strategy:  "readability-landmark",
              success:   true,
              error:     null,
            };
          }
          console.debug("[RC readability] stage 2 paywall detected");
        }
      }
    } catch (err) {
      console.warn("[RC readability] stage 2 (article/main) failed:", err.message);
    }

    // ── Stage 3: first 3 visible <p> elements ──────────────────────────────
    try {
      const allPs    = document.querySelectorAll("p");
      const visible  = [];
      for (let i = 0; i < allPs.length && visible.length < 3; i++) {
        if (_isVisible(allPs[i])) {
          visible.push(allPs[i]);
        }
      }
      if (visible.length > 0) {
        const raw = visible
          .map(function (p) { return (p.innerText || p.textContent || "").trim(); })
          .filter(function (t) { return t.length > 0; })
          .join("\n\n");

        if (raw.length >= MIN_FALLBACK_B_CHARS) {
          const isPaywall = window.RC.isPaywallText && window.RC.isPaywallText(raw);
          if (!isPaywall) {
            console.debug("[RC readability] stage 3 (visible <p>) succeeded — chars:", raw.length);
            const text = raw.slice(0, MAX_TEXT_LENGTH);
            return {
              text,
              title, url, timestamp,
              wordCount: _countWords(text),
              strategy:  "readability-paragraphs",
              success:   true,
              error:     null,
            };
          }
          console.debug("[RC readability] stage 3 paywall detected");
        }
      }
    } catch (err) {
      console.warn("[RC readability] stage 3 (visible <p>) failed:", err.message);
    }

    // ── Stage 4: filtered innerText (broad sweep) ──────────────────────────
    const fallback4 = this._innerTextFallback(url, title, timestamp);
    if (fallback4.success) {
      console.debug("[RC readability] stage 4 (innerText) succeeded — chars:", fallback4.text.length);
      return fallback4;
    }

    // ── Stage 5: all paths exhausted ───────────────────────────────────────
    console.debug("[RC readability] all stages failed — unable to extract");
    return {
      text: "", title, url, timestamp,
      wordCount: 0,
      strategy:  "readability",
      success:   false,
      error:     "unable to extract",
    };
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Removes paywall/modal overlay elements from a document clone in-place.
   * Works on class-name substring matches so minor naming variations are caught.
   * Never touches the live DOM.
   *
   * @param {Document} doc - A cloned document (safe to mutate).
   */
  function _removePaywallModals(doc) {
    PAYWALL_CLASS_PATTERNS.forEach(function (pattern) {
      try {
        var selector = '[class*="' + pattern + '"]';
        doc.querySelectorAll(selector).forEach(function (el) { el.remove(); });
      } catch (_) {}
    });
  }

  /**
   * Returns true when an element has a non-zero bounding box and is not
   * hidden via CSS visibility or display.  Used to filter <p> tags to those
   * the user can actually see.
   *
   * @param {Element} el
   * @returns {boolean}
   */
  function _isVisible(el) {
    try {
      const rect  = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return (
        rect.width  > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display    !== "none"
      );
    } catch (_) {
      return false;
    }
  }

  /**
   * Strips noisy structural elements from a body clone, then reads innerText.
   * Identical logic to the previous implementation — kept as Stage 4 broad sweep.
   *
   * @private
   */
  ReadabilityStrategy.prototype._innerTextFallback = function (url, title, timestamp) {
    try {
      const bodyClone = document.body.cloneNode(true);

      SKIP_TAGS.forEach(function (tag) {
        bodyClone.querySelectorAll(tag).forEach(function (el) { el.remove(); });
      });

      const raw  = (bodyClone.innerText || bodyClone.textContent || "").trim();
      const text = raw.slice(0, MAX_TEXT_LENGTH);

      return {
        text,
        title, url, timestamp,
        wordCount: _countWords(text),
        strategy:  "readability-fallback",
        success:   text.length > 0,
        error:     text.length === 0 ? "no_content" : null,
      };
    } catch (err) {
      return {
        text: "", title, url, timestamp,
        wordCount: 0,
        strategy:  "readability-fallback",
        success:   false,
        error:     err.message,
      };
    }
  };

  function _countWords(text) {
    return text.trim().split(/\s+/).filter(function (w) { return w.length > 0; }).length;
  }

  window.RC.ReadabilityStrategy = ReadabilityStrategy;
})();
