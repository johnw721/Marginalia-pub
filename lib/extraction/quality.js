// lib/extraction/quality.js
// Runs a lightweight sanity check on extracted text before it is sent as a
// READING_CHUNK.  Two signals catch the most common failure modes:
//
//   1. Word count  — fewer than 50 words means a homepage, error page, or
//                    a page that the strategy failed to parse.
//   2. Noise ratio — if more than 40 % of characters are "noisy" (not letters,
//                    digits, spaces, or common sentence punctuation) the text
//                    is probably garbled: minified JS, encoded content, symbol
//                    spam, etc.
//
// Returns a plain object so callers can log the reason without re-running the
// check.
//
// Attached to the shared RC namespace so content.js can call RC.qualityCheck().

(function () {
  "use strict";

  window.RC = window.RC || {};

  /**
   * Characters that are NOT considered noise:
   *   - Word characters:        a-z A-Z 0-9 _
   *   - Whitespace:             space \t \n \r
   *   - Core sentence marks:    . , ! ? ' " : ; - ( ) /
   *
   * Everything outside this set increments the noise counter.
   */
  const CLEAN_CHAR = /[A-Za-z0-9\s.,!?'"();:\-\/]/;

  /**
   * @typedef  {Object} QualityResult
   * @property {boolean}       pass       - True when the text meets both thresholds.
   * @property {number}        wordCount  - Number of whitespace-delimited tokens.
   * @property {number}        noiseRatio - Fraction of characters flagged as noisy (0–1).
   * @property {string|null}   reason     - "too_short" | "too_noisy" | null on pass.
   */

  /**
   * Checks whether `text` is rich enough and clean enough to be worth sending.
   *
   * @param  {string} text - The plain-text extraction result.
   * @returns {QualityResult}
   */
  function qualityCheck(text) {
    if (!text || typeof text !== "string") {
      return { pass: false, wordCount: 0, noiseRatio: 0, reason: "too_short" };
    }

    // --- word count ---
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    const wordCount = words.length;

    if (wordCount < 50) {
      return { pass: false, wordCount, noiseRatio: 0, reason: "too_short" };
    }

    // --- noise ratio ---
    let noisyChars = 0;
    for (let i = 0; i < text.length; i++) {
      if (!CLEAN_CHAR.test(text[i])) noisyChars++;
    }
    const noiseRatio = noisyChars / text.length;

    if (noiseRatio >= 0.4) {
      return { pass: false, wordCount, noiseRatio, reason: "too_noisy" };
    }

    return { pass: true, wordCount, noiseRatio, reason: null };
  }

  window.RC.qualityCheck = qualityCheck;

  // ---------------------------------------------------------------------------
  // isPaywallText
  // ---------------------------------------------------------------------------

  /**
   * Heuristic check: returns true when `text` looks like a paywall intercept
   * rather than the article body the user intended to read.
   *
   * Matches whole-string substrings (case-insensitive) that are characteristic
   * of soft-paywall overlays and login gates.  Intentionally conservative — a
   * false negative (missing a paywall) is better than a false positive (dropping
   * a legitimate article that happens to discuss subscriptions).
   *
   * Used by ReadabilityStrategy to decide whether to discard an extraction
   * result and try a fallback path instead.
   *
   * @param  {string}  text - Extracted plain text.
   * @returns {boolean}
   */
  function isPaywallText(text) {
    if (!text || typeof text !== "string") return false;

    var lower = text.toLowerCase();

    // Each pattern is a phrase that appears almost exclusively in paywall
    // intercepts rather than in article bodies.
    var PAYWALL_PHRASES = [
      "subscribe to continue reading",
      "subscribe to read",
      "subscribe to continue",
      "sign in to continue reading",
      "sign in to read",
      "sign in to continue",
      "sign up to continue reading",
      "sign up to read",
      "sign up to continue",
      "create a free account to read",
      "create an account to continue",
      "members only",
      "subscriber-only",
      "subscriber only",
      "this article is for subscribers",
      "this content is for subscribers",
      "to continue reading, please",
      "register to read",
      "view only",
      "unlock this article",
      "unlock full access",
      "you have used all your free",
      "you've used all your free",
      "metered paywall",
    ];

    for (var i = 0; i < PAYWALL_PHRASES.length; i++) {
      if (lower.indexOf(PAYWALL_PHRASES[i]) !== -1) return true;
    }
    return false;
  }

  window.RC.isPaywallText = isPaywallText;
})();
