// lib/behavior/strategies/embrace.js — EmbraceStrategy
//
// Collects identical signals to MitigateStrategy (active dwell, scroll velocity,
// keyboard/mouse interaction) but skips the threshold-based deep/skim/neutral
// classifier.  Instead it returns behavior: "embrace" with the raw numeric values,
// letting the system prompt's persona (The Enthusiast, Explorer, Scholar) interpret
// them in context rather than receiving a pre-decided label.
//
// This is suited to users who want the AI to form its own judgment about how they
// read — e.g. treating 45 s of dwell differently from 45 s of frantic skimming —
// rather than having the extension pre-decide "that was neutral."
//
// Signal collection is identical to MitigateStrategy; the only difference is
// classify(): it returns raw numbers instead of a categorical label.
//
// Attaches: window.RC.EmbraceStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  // ── Constants (mirror MitigateStrategy for consistency) ───────────────────
  var ACTIVE_DWELL_CAP_S        = 300;   // hard cap: 5 minutes
  var SCROLL_VELOCITY_WINDOW_MS = 3000;  // rolling window for velocity calc
  var MOUSEMOVE_THROTTLE_MS     = 200;   // mousemove fires hundreds of times/s

  // ── EmbraceStrategy ───────────────────────────────────────────────────────

  function EmbraceStrategy() {
    this.id = "embrace";

    // Active dwell state
    this._activeSince        = null;   // ms timestamp when current active period started
    this._totalActiveDwellMs = 0;      // ms accumulated from completed active periods

    // Scroll state
    this._scrollEvents = [];           // ring buffer: [{t, dy}, …]
    this._lastScrollY  = window.scrollY || 0;

    // Interaction state
    this._hasInteracted     = false;
    this._lastMouseThrottle = 0;

    this._init();
  }

  // ── Signal collection — identical to MitigateStrategy ────────────────────

  EmbraceStrategy.prototype._init = function () {
    var self = this;

    // Tab is almost certainly visible/focused at document_idle — start clock.
    if (document.visibilityState === "visible" && document.hasFocus()) {
      self._activeSince = Date.now();
    }

    // Visibility: tab switching, window minimise
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") {
        self._pauseDwell();
      } else if (document.visibilityState === "visible" && document.hasFocus()) {
        self._resumeDwell();
      }
    });

    // Focus/blur: clicking other apps or windows
    window.addEventListener("focus", function () {
      if (document.visibilityState === "visible") self._resumeDwell();
    });
    window.addEventListener("blur", function () {
      self._pauseDwell();
    });

    // Scroll (passive — never blocks paint)
    document.addEventListener("scroll", function () {
      var now      = Date.now();
      var currentY = window.scrollY || 0;
      var dy       = Math.abs(currentY - self._lastScrollY);
      self._lastScrollY = currentY;
      self._scrollEvents.push({ t: now, dy: dy });
      self._trimScrollEvents(now);
    }, { passive: true });

    // Keyboard: genuine engagement proxy
    document.addEventListener("keydown", function () {
      self._hasInteracted = true;
    }, { passive: true });

    // Mouse (throttled)
    document.addEventListener("mousemove", function () {
      var now = Date.now();
      if (now - self._lastMouseThrottle >= MOUSEMOVE_THROTTLE_MS) {
        self._lastMouseThrottle = now;
        self._hasInteracted = true;
      }
    }, { passive: true });

    document.addEventListener("click", function () {
      self._hasInteracted = true;
    }, { passive: true });
  };

  EmbraceStrategy.prototype._pauseDwell = function () {
    if (this._activeSince !== null) {
      this._totalActiveDwellMs += Date.now() - this._activeSince;
      this._activeSince = null;
    }
  };

  EmbraceStrategy.prototype._resumeDwell = function () {
    if (this._activeSince === null) {
      this._activeSince = Date.now();
    }
  };

  EmbraceStrategy.prototype._currentDwellS = function () {
    var ms = this._totalActiveDwellMs;
    if (this._activeSince !== null) ms += Date.now() - this._activeSince;
    return Math.min(ms / 1000, ACTIVE_DWELL_CAP_S);
  };

  EmbraceStrategy.prototype._trimScrollEvents = function (now) {
    var cutoff = now - SCROLL_VELOCITY_WINDOW_MS;
    var i = 0;
    while (i < this._scrollEvents.length && this._scrollEvents[i].t < cutoff) i++;
    if (i > 0) this._scrollEvents = this._scrollEvents.slice(i);
  };

  EmbraceStrategy.prototype._scrollVelocityPxS = function () {
    var now = Date.now();
    this._trimScrollEvents(now);
    var events = this._scrollEvents;
    if (events.length < 2) return 0;
    var totalPx  = events.reduce(function (sum, ev) { return sum + ev.dy; }, 0);
    var windowMs = events[events.length - 1].t - events[0].t;
    if (windowMs < 1) return 0;
    return (totalPx / windowMs) * 1000;
  };

  // ── classify() ────────────────────────────────────────────────────────────

  /**
   * Returns the raw signal values WITHOUT pre-classifying them.
   *
   * behavior: "embrace" acts as a sentinel that tells buildUserMessage in
   * lib/prompts.js to present the numbers as raw observations rather than
   * wrapping them in a "deep/skim/neutral" label.  The Enthusiast / Explorer /
   * Scholar system prompts are written to receive raw numbers and form their
   * own judgment.
   *
   * @returns {{ behavior: "embrace", signals: BehaviorSignals }}
   */
  EmbraceStrategy.prototype.classify = function () {
    try {
      return {
        behavior: "embrace",
        signals: {
          dwell:          Math.round(this._currentDwellS()),
          scrollVelocity: Math.round(this._scrollVelocityPxS()),
          active:         this._hasInteracted,
        },
      };
    } catch (err) {
      console.warn("[RC embrace] classify() error — returning zeroed signals:", err.message);
      return {
        behavior: "embrace",
        signals: { dwell: 0, scrollVelocity: 0, active: false },
      };
    }
  };

  window.RC.EmbraceStrategy = EmbraceStrategy;
})();
