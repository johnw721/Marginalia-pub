// lib/behavior/strategies/mitigate.js
// MitigateStrategy — multi-signal reading behavior classifier.
//
// Classifies the current page session as "deep", "skim", or "neutral" by
// combining three complementary signals:
//
//   1. Active dwell      — time the tab is visible + window focused, capped at
//                          ACTIVE_DWELL_CAP_S.  Resists tab-abandonment inflation.
//   2. Scroll velocity   — pixels/second of recent scrolling.  Fast scroll ≈ skim.
//   3. Keyboard/mouse    — boolean: any interaction recorded this session.
//                          Distinguishes an engaged reader from a parked tab.
//
// All DOM listeners are attached once in the constructor via _init().
// classify() is synchronous — it reads already-accumulated state.
//
// Attaches: window.RC.MitigateStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  // ==========================================================================
  // TUNABLE CONSTANTS — edit these to adjust classification sensitivity
  // ==========================================================================

  /** Active dwell seconds required to classify a session as "deep". */
  var DEEP_ACTIVE_DWELL_S   = 90;

  /**
   * Active dwell seconds at or below which a session is classified as "skim"
   * (provided scroll velocity does not already flag it as a skim first).
   */
  var SKIM_ACTIVE_DWELL_S   = 30;

  /**
   * Scroll velocity threshold in pixels/second.
   * Sessions averaging above this speed are classified as "skim" regardless
   * of dwell time, because the user is moving too fast to be reading.
   */
  var SKIM_SCROLL_PX_S      = 300;

  /**
   * Hard cap on active dwell accumulation in seconds (5 minutes).
   *
   * Without a cap, a tab left open overnight accumulates thousands of seconds
   * of apparent "dwell" even though the user stopped reading long ago.  The cap
   * ensures dwell reflects intentional engagement: 300 s is long enough for even
   * the longest long-form articles a typical reader would finish in one sitting,
   * but short enough to ignore tab abandonment.
   */
  var ACTIVE_DWELL_CAP_S    = 300;

  /**
   * Rolling window (ms) for scroll velocity calculation.
   * Only scroll events within this window of the classify() call are used.
   * Older events are discarded to capture the user's *recent* behavior.
   */
  var SCROLL_VELOCITY_WINDOW_MS = 3000;

  /**
   * Mousemove events fire hundreds of times per second.
   * Throttle them to this interval (ms) to avoid flooding the event array.
   */
  var MOUSEMOVE_THROTTLE_MS = 200;

  // ==========================================================================
  // MitigateStrategy
  // ==========================================================================

  function MitigateStrategy() {
    this.id = "mitigate";

    // --- Manual override state ---------------------------------------------
    // When set to "deep" or "skim", classify() returns that label regardless
    // of actual signals.  Signal collection continues unaffected so dwell time
    // is accurate if/when the override is cleared.  null = auto (no override).
    this._override = null;

    // --- Active dwell state -------------------------------------------------
    // _activeSince: timestamp (ms) when the current active period started,
    //               or null when the session is currently inactive.
    this._activeSince        = null;
    // _totalActiveDwellMs: accumulated ms from *completed* active periods.
    //                      Does not include the currently-open period (if any).
    this._totalActiveDwellMs = 0;

    // --- Scroll state -------------------------------------------------------
    // Ring buffer of recent scroll events: [{t: timestamp, dy: pixels}, ...]
    // Trimmed to SCROLL_VELOCITY_WINDOW_MS on every new event.
    this._scrollEvents = [];
    this._lastScrollY  = window.scrollY || 0;

    // --- Interaction state --------------------------------------------------
    this._hasInteracted      = false;
    this._lastMouseThrottle  = 0;

    this._init();
  }

  // --------------------------------------------------------------------------
  // Initialization — attach all DOM listeners
  // --------------------------------------------------------------------------

  MitigateStrategy.prototype._init = function () {
    var self = this;

    // --- Determine initial active state ------------------------------------
    // The script loads at document_idle; the tab is almost certainly visible
    // and focused at that moment.  Start the dwell clock if so.
    if (document.visibilityState === "visible" && document.hasFocus()) {
      self._activeSince = Date.now();
    }

    // --- Visibility change (tab switching, minimise) -----------------------
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        self._pauseDwell();
      } else if (document.visibilityState === "visible" && document.hasFocus()) {
        self._resumeDwell();
      }
    });

    // --- Window focus / blur (clicking other apps, other windows) ----------
    window.addEventListener("focus", function () {
      if (document.visibilityState === "visible") {
        self._resumeDwell();
      }
    });

    window.addEventListener("blur", function () {
      self._pauseDwell();
    });

    // --- Scroll events (passive — never blocks paint) ----------------------
    document.addEventListener("scroll", function () {
      var now    = Date.now();
      var currentY = window.scrollY || 0;
      var dy     = Math.abs(currentY - self._lastScrollY);
      self._lastScrollY = currentY;

      self._scrollEvents.push({ t: now, dy: dy });

      // Trim events outside the velocity window eagerly to keep the array small.
      self._trimScrollEvents(now);
    }, { passive: true });

    // --- Keyboard activity (genuine engagement proxy) ----------------------
    document.addEventListener("keydown", function () {
      self._hasInteracted = true;
    }, { passive: true });

    // --- Mouse activity (throttled — mousemove fires very frequently) ------
    document.addEventListener("mousemove", function () {
      var now = Date.now();
      if (now - self._lastMouseThrottle >= MOUSEMOVE_THROTTLE_MS) {
        self._lastMouseThrottle = now;
        self._hasInteracted = true;
      }
    }, { passive: true });

    // Also count clicks as interaction (no throttle needed — clicks are rare).
    document.addEventListener("click", function () {
      self._hasInteracted = true;
    }, { passive: true });
  };

  // --------------------------------------------------------------------------
  // Dwell helpers
  // --------------------------------------------------------------------------

  /**
   * Pause the active dwell clock (called on hide / blur).
   * Flushes the elapsed time from the current active period into
   * _totalActiveDwellMs, then clears _activeSince.
   */
  MitigateStrategy.prototype._pauseDwell = function () {
    if (this._activeSince !== null) {
      this._totalActiveDwellMs += Date.now() - this._activeSince;
      this._activeSince = null;
    }
  };

  /**
   * Resume the active dwell clock (called on show / focus).
   * Only starts a new period if one is not already running.
   */
  MitigateStrategy.prototype._resumeDwell = function () {
    if (this._activeSince === null) {
      this._activeSince = Date.now();
    }
  };

  /**
   * Returns the current total active dwell in seconds, applying the hard cap.
   * Does NOT mutate _activeSince or _totalActiveDwellMs — safe to call multiple
   * times and from classify() without side effects.
   *
   * @returns {number} Dwell in seconds, clamped to [0, ACTIVE_DWELL_CAP_S].
   */
  MitigateStrategy.prototype._currentDwellS = function () {
    var ms = this._totalActiveDwellMs;
    if (this._activeSince !== null) {
      ms += Date.now() - this._activeSince;
    }
    return Math.min(ms / 1000, ACTIVE_DWELL_CAP_S);
  };

  // --------------------------------------------------------------------------
  // Scroll velocity helper
  // --------------------------------------------------------------------------

  /**
   * Remove scroll events older than SCROLL_VELOCITY_WINDOW_MS from the buffer.
   *
   * @param {number} now - Current timestamp (ms).
   */
  MitigateStrategy.prototype._trimScrollEvents = function (now) {
    var cutoff = now - SCROLL_VELOCITY_WINDOW_MS;
    var i = 0;
    while (i < this._scrollEvents.length && this._scrollEvents[i].t < cutoff) {
      i++;
    }
    if (i > 0) {
      this._scrollEvents = this._scrollEvents.slice(i);
    }
  };

  /**
   * Computes average scroll velocity (px/s) over the recent event window.
   * Returns 0 if there are fewer than two events (no meaningful velocity).
   *
   * @returns {number} Velocity in px/s.
   */
  MitigateStrategy.prototype._scrollVelocityPxS = function () {
    var now = Date.now();
    this._trimScrollEvents(now);

    var events = this._scrollEvents;
    if (events.length < 2) {
      return 0;
    }

    var totalPx = events.reduce(function (sum, ev) { return sum + ev.dy; }, 0);
    var windowMs = events[events.length - 1].t - events[0].t;

    // Guard against a collapsed window (all events at the same millisecond).
    if (windowMs < 1) {
      return 0;
    }

    return (totalPx / windowMs) * 1000;
  };

  // --------------------------------------------------------------------------
  // classify()
  // --------------------------------------------------------------------------

  // --------------------------------------------------------------------------
  // Manual override
  // --------------------------------------------------------------------------

  /**
   * Sets (or clears) a manual behavior override for this session.
   *
   * While an override is active, classify() returns the forced label instead
   * of the threshold-computed one.  Signal collection is unaffected — dwell
   * time and scroll velocity continue accumulating so the real engagement data
   * is available if/when the override is later cleared.
   *
   * Called by the behavior factory (lib/behavior/index.js) on strategy creation
   * and in response to storage.onChanged when the user changes the sidebar
   * mode dropdown mid-session.
   *
   * @param {string|null} mode  "deep" | "skim" | null (null clears the override)
   */
  MitigateStrategy.prototype.setOverride = function (mode) {
    this._override = (mode === "deep" || mode === "skim") ? mode : null;
    console.debug("[RC mitigate] override set to:", this._override || "auto");
  };


  // --------------------------------------------------------------------------
  // classify()
  // --------------------------------------------------------------------------

  /**
   * Reads the accumulated signal state and returns a BehaviorResult.
   * Synchronous.  Safe to call multiple times.
   *
   * Classification logic:
   *   1. Compute active dwell (seconds, capped at ACTIVE_DWELL_CAP_S).
   *   2. Compute recent scroll velocity over SCROLL_VELOCITY_WINDOW_MS.
   *   3. Apply priority rules:
   *        deep  — dwell >= DEEP_ACTIVE_DWELL_S (scroll velocity cannot override)
   *        skim  — scroll velocity > SKIM_SCROLL_PX_S OR dwell <= SKIM_ACTIVE_DWELL_S
   *        neutral — everything else
   *   4. If a manual override is active, substitute it for the computed label
   *      (signal values are still the real measured values).
   *
   * @returns {{ behavior: string, signals: { dwell: number, scrollVelocity: number, active: boolean } }}
   */
  MitigateStrategy.prototype.classify = function () {
    var dwell    = this._currentDwellS();
    var velocity = this._scrollVelocityPxS();

    var behavior;
    if (dwell >= DEEP_ACTIVE_DWELL_S) {
      behavior = "deep";
    } else if (velocity > SKIM_SCROLL_PX_S || dwell <= SKIM_ACTIVE_DWELL_S) {
      behavior = "skim";
    } else {
      behavior = "neutral";
    }

    // Apply manual override (if set to a recognised value).
    if (this._override === "deep" || this._override === "skim") {
      behavior = this._override;
    }

    return {
      behavior: behavior,
      signals: {
        dwell:         dwell,
        scrollVelocity: velocity,
        active:        this._hasInteracted,
      },
    };
  };

  // --------------------------------------------------------------------------
  // Expose on window.RC
  // --------------------------------------------------------------------------

  window.RC.MitigateStrategy = MitigateStrategy;

  console.debug("[RC mitigate] MitigateStrategy loaded");

})();
