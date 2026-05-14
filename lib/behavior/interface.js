/**
 * @file interface.js
 * @description
 * Shared interface contract for all behavior strategies.
 * Every strategy must implement `classify()` so the rest of the app
 * (content.js, the factory in index.js) never needs to know which concrete
 * strategy is active.
 *
 * This file is documentation only — it is not loaded as a content script.
 * Concrete strategies live in lib/behavior/strategies/.
 *
 * The three strategies form the "behavior axis" of the 3×3 agent matrix:
 *   - MitigateStrategy — multi-signal classifier (MVP, most reliable)
 *   - EmbraceStrategy  — raw signals forwarded to the LLM for interpretation
 *   - EraseStrategy    — no behavioral detection; always returns "neutral"
 */

// ---------------------------------------------------------------------------
// BehaviorSignals
// ---------------------------------------------------------------------------

/**
 * The raw signal readings collected by MitigateStrategy.
 * EmbraceStrategy forwards these directly to the LLM.
 * EraseStrategy always returns zeroed/false values.
 *
 * @typedef {Object} BehaviorSignals
 * @property {number}  dwell          - Active dwell time in seconds, capped at
 *                                      ACTIVE_DWELL_CAP_S (300). "Active" means
 *                                      the tab is visible AND the window has focus.
 * @property {number}  scrollVelocity - Scroll velocity in pixels/second, averaged
 *                                      over the most recent scroll events.
 *                                      0 if no scrolling occurred.
 * @property {boolean} active         - true if any keyboard or mouse interaction
 *                                      was recorded during this page session.
 *                                      Used as a proxy for genuine engagement.
 */

// ---------------------------------------------------------------------------
// BehaviorResult
// ---------------------------------------------------------------------------

/**
 * The normalized output returned by every BehaviorStrategy.classify() call.
 *
 * @typedef {Object} BehaviorResult
 * @property {"deep"|"skim"|"neutral"} behavior - Inferred reading mode:
 *   - "deep"    — sustained, engaged reading (≥ 90 s active dwell by default)
 *   - "skim"    — quick pass or high-velocity scroll (≤ 30 s or fast scroll)
 *   - "neutral" — between thresholds, or EraseStrategy active
 * @property {BehaviorSignals} signals - The raw signal snapshot used to derive
 *                                       `behavior`. Always populated, even by
 *                                       EraseStrategy (with zeroed values).
 */

// ---------------------------------------------------------------------------
// BehaviorStrategy interface
// ---------------------------------------------------------------------------

/**
 * Every behavior strategy must expose a string `id` and implement `classify()`.
 * The factory in `lib/behavior/index.js` selects the active strategy at runtime;
 * content.js calls only `classify()`.
 *
 * Strategies are responsible for attaching their own DOM event listeners during
 * initialization (constructor or a private _init method).  They must not rely on
 * content.js to start or stop observation.
 *
 * @interface BehaviorStrategy
 */

/**
 * Unique identifier for this strategy.  Matches the value stored in
 * chrome.storage.local under the key `"behaviorStrategy"`.
 *
 * @name BehaviorStrategy#id
 * @type {"mitigate"|"embrace"|"erase"}
 */

/**
 * Reads the accumulated signal state and returns a behavior classification.
 * Must be synchronous — it reads already-collected data rather than performing
 * any async I/O.
 *
 * Implementations are responsible for:
 *   - Returning a fully populated BehaviorResult on every call
 *   - Never throwing (catch internally and return a neutral result on error)
 *   - Producing stable, repeatable results from the same accumulated state
 *
 * @function
 * @name BehaviorStrategy#classify
 * @returns {BehaviorResult}
 */
