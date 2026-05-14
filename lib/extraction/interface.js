/**
 * @file interface.js
 * @description
 * Shared interface contract for all extraction strategies.
 * Every strategy must implement `canHandle()` and `extract()` so the rest of
 * the app (content.js, the factory in index.js) never needs to know which
 * concrete strategy is active.
 *
 * This file is documentation only — it is not loaded as a content script.
 * Concrete strategies live in lib/extraction/strategies/.
 */

// ---------------------------------------------------------------------------
// ExtractionResult
// ---------------------------------------------------------------------------

/**
 * The normalized output returned by every ExtractionStrategy.extract() call.
 *
 * @typedef {Object} ExtractionResult
 * @property {string}      text        - Plain text of the main article content,
 *                                       trimmed and truncated to 8 000 chars.
 * @property {string}      title       - Page or article title.
 * @property {string}      url         - Canonical URL (location.href at extraction time).
 * @property {number}      timestamp   - Unix ms timestamp of extraction (Date.now()).
 * @property {number}      wordCount   - Approximate word count of `text`.
 * @property {string}      strategy    - Strategy identifier that produced this result:
 *                                       "readability" | "readability-fallback" |
 *                                       "viewport"    | "structured".
 * @property {boolean}     success     - Whether extraction produced usable content.
 * @property {string|null} error       - Error message on failure; null on success.
 */

// ---------------------------------------------------------------------------
// ExtractionStrategy interface
// ---------------------------------------------------------------------------

/**
 * Every extraction strategy must expose a string `id` and implement the two
 * methods below.  The factory in `lib/extraction/index.js` selects the active
 * strategy at runtime; content.js calls only `canHandle()` and `extract()`.
 *
 * @interface ExtractionStrategy
 */

/**
 * Unique identifier for this strategy.  Matches the value stored in
 * chrome.storage.local under the key `"extractionStrategy"`.
 *
 * @name ExtractionStrategy#id
 * @type {"readability"|"viewport"|"structured"}
 */

/**
 * Returns true if this strategy is capable of extracting content from the
 * current page.  Called by the factory after selecting a strategy; if it
 * returns false the factory falls back to ReadabilityStrategy.
 *
 * Implementations may inspect `document`, `location`, loaded globals, etc.
 * Must be synchronous.
 *
 * @function
 * @name ExtractionStrategy#canHandle
 * @returns {boolean}
 */

/**
 * Performs the extraction.  Must return a fully populated ExtractionResult.
 * On failure, `success` must be false and `error` must describe what went
 * wrong; `text` may be an empty string.
 *
 * Implementations are responsible for:
 *   - Trying their primary extraction path
 *   - Falling back to a secondary path if the primary fails
 *   - Truncating `text` to 8 000 characters
 *   - Populating every field of ExtractionResult
 *
 * @async
 * @function
 * @name ExtractionStrategy#extract
 * @returns {Promise<ExtractionResult>}
 */
