// lib/extraction/index.js
// Strategy factory for the extraction module.
//
// getStrategy() reads the user's preferred extraction strategy from
// chrome.storage.local ("extractionStrategy" key).  If no preference is
// stored it defaults to "readability".  After selecting the strategy it calls
// canHandle(); if that returns false it falls back to ReadabilityStrategy.
//
// All three strategy constructors must be loaded before this file:
//   vendor/Readability.js
//   lib/extraction/strategies/viewport.js
//   lib/extraction/strategies/structured.js
//   lib/extraction/strategies/readability.js   ← must come last
//
// Attaches: window.RC.getStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  /**
   * Strategy registry — maps the storage key value to a constructor.
   * ReadabilityStrategy is registered as the default and as the fallback.
   */
  function _buildRegistry() {
    return {
      readability: window.RC.ReadabilityStrategy,
      viewport:    window.RC.ViewportStrategy,
      structured:  window.RC.StructuredStrategy,
    };
  }

  /**
   * Reads `extractionStrategy` from chrome.storage.local and returns an
   * instantiated, canHandle()-verified ExtractionStrategy.
   *
   * Resolution order:
   *   1. Stored preference  → instantiate → canHandle() → use if true
   *   2. canHandle() false  → fall back to ReadabilityStrategy
   *   3. Unknown key        → ReadabilityStrategy directly
   *
   * @returns {Promise<ExtractionStrategy>}
   */
  async function getStrategy() {
    const registry = _buildRegistry();

    let preferredKey = "readability";
    try {
      const stored = await chrome.storage.local.get("extractionStrategy");
      if (stored.extractionStrategy && registry[stored.extractionStrategy]) {
        preferredKey = stored.extractionStrategy;
      }
    } catch (err) {
      // chrome.storage unavailable in some test environments — safe to ignore.
      console.warn("[RC getStrategy] storage read failed:", err.message);
    }

    const Ctor = registry[preferredKey] || window.RC.ReadabilityStrategy;
    const strategy = new Ctor();

    if (!strategy.canHandle()) {
      console.info(
        "[RC getStrategy] %s.canHandle() → false; falling back to ReadabilityStrategy",
        strategy.id
      );
      return new window.RC.ReadabilityStrategy();
    }

    return strategy;
  }

  window.RC.getStrategy = getStrategy;
})();
