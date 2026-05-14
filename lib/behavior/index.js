// lib/behavior/index.js
// Strategy factory for the behavior module.
//
// getBehaviorStrategy() reads the user's preferred behavior strategy from
// chrome.storage.local ("behaviorStrategy" key).  If no preference is stored it
// defaults to "mitigate".
//
// Unlike the extraction factory, behavior strategies are stateful — they attach
// DOM listeners in their constructors and accumulate signal data over time.
// The factory therefore creates ONE instance per page load and caches it.
// Subsequent calls to getBehaviorStrategy() return the same instance so that
// signal state (dwell time, scroll history, etc.) is preserved.
//
// Manual mode override:
//   The sidebar dropdown writes "behaviorModeOverride" ("auto" | "deep" | "skim")
//   to chrome.storage.local.  This file:
//     1. Reads the persisted override when the strategy instance is first created.
//     2. Calls strategy.setOverride() to apply it immediately.
//     3. Listens for storage changes so an override set mid-session takes effect
//        for the current page's next classification without requiring a navigation.
//
// All three strategy constructors must be loaded before this file:
//   lib/behavior/strategies/embrace.js
//   lib/behavior/strategies/erase.js
//   lib/behavior/strategies/mitigate.js   ← must come last (MVP default)
//
// Attaches: window.RC.getBehaviorStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  /**
   * Maps the chrome.storage key value to a constructor.
   * All three constructors must be registered before this IIFE runs.
   */
  function _buildRegistry() {
    return {
      mitigate: window.RC.MitigateStrategy,
      embrace:  window.RC.EmbraceStrategy,
      erase:    window.RC.EraseStrategy,
    };
  }

  // Singleton cache — one instance per page load, set on first call.
  var _cachedStrategy = null;

  // ---------------------------------------------------------------------------
  // Storage listener — propagates override changes to the cached strategy
  // immediately, without requiring a page reload or SPA navigation.
  // ---------------------------------------------------------------------------

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== "local" || !changes.behaviorModeOverride) return;
    if (!_cachedStrategy || typeof _cachedStrategy.setOverride !== "function") return;

    var mode = changes.behaviorModeOverride.newValue || "auto";
    _cachedStrategy.setOverride(mode === "auto" ? null : mode);
    console.debug("[RC behavior] mode override updated to:", mode);
  });

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  /**
   * Returns the active BehaviorStrategy instance, creating it on first call.
   *
   * On first call:
   *   1. Reads "behaviorStrategy" and "behaviorModeOverride" from chrome.storage.local.
   *   2. Instantiates the matching strategy (defaults to MitigateStrategy).
   *   3. Applies any persisted override via setOverride().
   *   4. Caches the instance for all future calls.
   *
   * On subsequent calls: returns the cached instance immediately.
   *
   * @returns {Promise<BehaviorStrategy>}
   */
  async function getBehaviorStrategy() {
    if (_cachedStrategy !== null) {
      return _cachedStrategy;
    }

    var registry     = _buildRegistry();
    var preferredKey = "mitigate";
    var override     = null;

    try {
      var stored = await chrome.storage.local.get(
        ["behaviorStrategy", "behaviorModeOverride"]
      );

      if (stored.behaviorStrategy && registry[stored.behaviorStrategy]) {
        preferredKey = stored.behaviorStrategy;
      }
      if (stored.behaviorModeOverride && stored.behaviorModeOverride !== "auto") {
        override = stored.behaviorModeOverride;
      }
    } catch (err) {
      // chrome.storage unavailable in some test environments — fall back to default.
      console.warn("[RC getBehaviorStrategy] storage read failed:", err.message);
    }

    var Ctor = registry[preferredKey] || window.RC.MitigateStrategy;
    _cachedStrategy = new Ctor();

    // Apply any persisted mode override (only meaningful if strategy has setOverride).
    if (override && typeof _cachedStrategy.setOverride === "function") {
      _cachedStrategy.setOverride(override);
    }

    console.debug(
      "[RC getBehaviorStrategy] strategy:", _cachedStrategy.id,
      "| override:", override || "auto"
    );
    return _cachedStrategy;
  }

  window.RC.getBehaviorStrategy = getBehaviorStrategy;
})();
