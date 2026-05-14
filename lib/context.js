// lib/context.js — Rolling 10-minute reading context window (Phase 4)
//
// Responsibilities:
//   - Maintain an in-memory array of recent reading chunks (10-minute window)
//   - Persist to chrome.storage.session on every ingest so state survives SW restarts
//   - Hydrate from session storage on first use so no data is lost across idle periods
//
// This file is loaded via importScripts() in the service worker, so it runs in the
// SW global scope and may NOT use ES module syntax.  All exports live on self.RC_Context.
//
// Public API (on self.RC_Context):
//   addChunk(chunk)       — ingest a READING_CHUNK payload
//   getChunks()           — return a copy of the current window
//   getSessionSummary()   — return { chunk_count, total_dwell_seconds, titles, behaviors }

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const WINDOW_MS      = 10 * 60 * 1000; // 10-minute rolling window
  const MAX_CHUNKS     = 10;             // hard cap on stored entries
  const MAX_TEXT_CHARS = 4000;           // text truncation limit before storage
  const STORAGE_KEY    = "recent_chunks";

  // ---------------------------------------------------------------------------
  // In-memory state
  // ---------------------------------------------------------------------------

  let recent_chunks = [];

  // ---------------------------------------------------------------------------
  // Hydration
  //
  // Service workers can be killed when idle and restarted on the next message.
  // On each restart recent_chunks resets to [].  Eagerly reading session storage
  // here restores the window before any addChunk() call mutates it.
  //
  // addChunk() awaits this promise so it never overwrites hydrated data, even
  // when multiple messages arrive in rapid succession before the read completes.
  // ---------------------------------------------------------------------------

  const _hydratePromise = new Promise(function (resolve) {
    chrome.storage.session.get(STORAGE_KEY, function (result) {
      if (result[STORAGE_KEY] && Array.isArray(result[STORAGE_KEY])) {
        recent_chunks = result[STORAGE_KEY];
        console.debug("[RC context] hydrated", recent_chunks.length, "chunk(s) from session storage");
      }
      resolve();
    });
  });

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Coerces a timestamp value to a numeric epoch millisecond value.
   * Falls back to Date.now() if the value is missing or unparseable.
   *
   * @param {*} ts
   * @returns {number}
   */
  function _normalizeTimestamp(ts) {
    if (typeof ts === "number" && ts > 0) return ts;
    if (ts) {
      const parsed = new Date(ts).getTime();
      if (!isNaN(parsed)) return parsed;
    }
    return Date.now();
  }

  /**
   * Removes entries older than WINDOW_MS and enforces the MAX_CHUNKS cap.
   * Called on every ingest — no background timer.
   */
  function _prune() {
    const cutoff = Date.now() - WINDOW_MS;

    recent_chunks = recent_chunks.filter(function (c) {
      return c.timestamp > cutoff;
    });

    // If we somehow accumulated more than MAX_CHUNKS, keep the most recent ones.
    if (recent_chunks.length > MAX_CHUNKS) {
      recent_chunks = recent_chunks.slice(-MAX_CHUNKS);
    }
  }

  /**
   * Writes the current window to chrome.storage.session.
   * Fire-and-forget: the returned Promise is intentionally not awaited by callers.
   */
  function _persist() {
    chrome.storage.session.set({ [STORAGE_KEY]: recent_chunks }, function () {
      if (chrome.runtime.lastError) {
        console.warn("[RC context] session storage write failed:", chrome.runtime.lastError.message);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Adds a reading chunk to the rolling window.
   *
   * Steps:
   *   1. Await hydration so in-memory state reflects any prior session data.
   *   2. Shallow-clone the chunk, truncating text to MAX_TEXT_CHARS.
   *   3. Normalise the timestamp to a numeric epoch value.
   *   4. Push onto recent_chunks, prune, then persist (fire-and-forget).
   *
   * This function is async so callers must NOT await it if they want fire-and-forget
   * semantics in the message handler — just call `addChunk(payload)` with no await.
   *
   * @param {Object} chunk - READING_CHUNK payload (title, url, text, timestamp,
   *                         wordCount, strategy, behavior, signals)
   */
  async function addChunk(chunk) {
    if (!chunk || typeof chunk !== "object") {
      console.warn("[RC context] addChunk: invalid chunk ignored", chunk);
      return;
    }

    // Gate on hydration so we never clobber restored data.
    await _hydratePromise;

    const stored = Object.assign({}, chunk, {
      text:      (chunk.text || "").slice(0, MAX_TEXT_CHARS),
      timestamp: _normalizeTimestamp(chunk.timestamp),
    });

    recent_chunks.push(stored);
    _prune();
    _persist(); // fire-and-forget

    console.debug(
      "[RC context] addChunk — window now", recent_chunks.length, "chunk(s)",
      { title: stored.title, behavior: stored.behavior, ts: stored.timestamp }
    );
  }

  /**
   * Returns a shallow copy of the current rolling window.
   * The copy is safe to mutate; changes do not affect internal state.
   *
   * @returns {Array<Object>}
   */
  function getChunks() {
    return recent_chunks.slice();
  }

  /**
   * Returns a lightweight summary derived from the current window.
   * Useful for constructing a system prompt preamble without sending full text.
   *
   * @returns {{
   *   chunk_count:         number,
   *   total_dwell_seconds: number,
   *   titles:              string[],
   *   behaviors:           string[]
   * }}
   */
  function getSessionSummary() {
    return {
      chunk_count: recent_chunks.length,

      total_dwell_seconds: recent_chunks.reduce(function (sum, c) {
        const dwell = c.signals && typeof c.signals.dwell === "number"
          ? c.signals.dwell
          : 0;
        return sum + dwell;
      }, 0),

      titles: recent_chunks
        .map(function (c) { return c.title; })
        .filter(Boolean),

      behaviors: recent_chunks
        .map(function (c) { return c.behavior; })
        .filter(Boolean),
    };
  }

  // ---------------------------------------------------------------------------
  // Expose on service worker global
  // ---------------------------------------------------------------------------

  self.RC_Context = { addChunk, getChunks, getSessionSummary };

  console.debug("[RC context] module loaded");
})();
