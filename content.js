// content.js — content script (Phase 3: extraction + behavior)
//
// Responsibilities:
//   - Wait for the page to settle after load (and after SPA navigations)
//   - Guard against non-article pages (< 200 visible chars)
//   - Select the active ExtractionStrategy via RC.getStrategy()
//   - Run qualityCheck() on the result (min 50 words, noise < 40 %)
//   - Classify reading behavior via RC.getBehaviorStrategy().classify()
//   - Truncate text to 8 000 chars and post READING_CHUNK to the service worker
//
// All RC.* helpers are injected by earlier content scripts in the manifest.

(function () {
  "use strict";

  const TAG = "[RC content]";
  const SETTLE_DELAY_MS = 1500;   // wait for dynamic content after load / navigation
  const MIN_VISIBLE_CHARS = 200;  // quick pre-check; catches blank and near-blank pages
  const MAX_TEXT_LENGTH = 8000;

  let settleTimer = null;
  let lastUrl = location.href;

  // ---------------------------------------------------------------------------
  // Failure signaling
  // Sends a READING_CHUNK with success:false so the sidebar can surface the
  // "select text → right-click" fallback prompt instead of staying silent.
  // ---------------------------------------------------------------------------

  function sendFailureChunk(reason) {
    try {
      chrome.runtime.sendMessage({
        type: "READING_CHUNK",
        payload: {
          success:   false,
          reason:    reason,
          url:       location.href,
          title:     document.title || "",
          timestamp: Date.now(),
          text:      "",
          strategy:  "failed",
          behavior:  "neutral",
          signals:   { dwell: 0, scrollVelocity: 0, active: false },
        },
      });
      console.debug(TAG, "failure chunk sent:", reason);
    } catch (err) {
      // Extension context may be invalidated on reload — not a user-facing error.
      console.warn(TAG, "sendFailureChunk failed:", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Main extraction pipeline
  // ---------------------------------------------------------------------------

  async function runExtraction() {
    // 1. Quick visible-text guard — avoids running the full strategy on
    //    homepages, login screens, 404s, etc.
    const visibleText = (document.body && document.body.innerText) || "";
    if (visibleText.trim().length < MIN_VISIBLE_CHARS) {
      console.debug(TAG, "skipped — visible text below threshold");
      sendFailureChunk("low_quality");
      return;
    }

    // 2. Select the extraction strategy configured by the user (or Readability).
    let strategy;
    try {
      strategy = await window.RC.getStrategy();
    } catch (err) {
      console.error(TAG, "getStrategy() failed:", err);
      return;
    }

    // 3. Extract.
    let result;
    try {
      result = await strategy.extract();
    } catch (err) {
      console.error(TAG, "extract() threw:", err);
      return;
    }

    if (!result.success || !result.text) {
      console.debug(TAG, "extraction unsuccessful or empty:", result.error);
      sendFailureChunk("low_quality");
      return;
    }

    // 4. Quality gate — filters homepages, pure navigation pages, error pages.
    const quality = window.RC.qualityCheck(result.text);
    if (!quality.pass) {
      console.debug(TAG, "quality check failed:", quality.reason,
        { wordCount: quality.wordCount, noiseRatio: quality.noiseRatio });
      sendFailureChunk("low_quality");
      return;
    }

    // 5. Classify reading behavior.
    //    getBehaviorStrategy() returns the cached strategy instance — the same
    //    object that has been accumulating signals since page load — so the
    //    classify() call reflects the full reading session up to this point.
    let behaviorResult = { behavior: "neutral", signals: { dwell: 0, scrollVelocity: 0, active: false } };
    try {
      const behaviorStrategy = await window.RC.getBehaviorStrategy();
      behaviorResult = behaviorStrategy.classify();
    } catch (err) {
      // Behavior classification is best-effort; extraction still succeeds.
      console.warn(TAG, "getBehaviorStrategy() / classify() failed:", err.message);
    }

    // 6. Build the chunk (ensure hard truncation even if strategy was lenient).
    const chunk = {
      success:   true,
      text:      result.text.slice(0, MAX_TEXT_LENGTH),
      title:     result.title,
      url:       result.url,
      timestamp: result.timestamp,
      wordCount: quality.wordCount,
      strategy:  result.strategy,
      // Behavior fields — set by MitigateStrategy (or stub) classify() call above.
      behavior:  behaviorResult.behavior,
      signals:   behaviorResult.signals,
    };

    // 7. Send to service worker.
    try {
      chrome.runtime.sendMessage({ type: "READING_CHUNK", payload: chunk });
      console.info(TAG, "READING_CHUNK sent", {
        strategy:       chunk.strategy,
        wordCount:      chunk.wordCount,
        url:            chunk.url,
        behavior:       chunk.behavior,
        dwell:          chunk.signals.dwell,
        scrollVelocity: chunk.signals.scrollVelocity,
        active:         chunk.signals.active,
      });
    } catch (err) {
      // Extension context can be invalidated on reload — not a user-facing error.
      console.warn(TAG, "sendMessage failed (extension reloaded?):", err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Page-settle scheduler
  // ---------------------------------------------------------------------------

  function scheduleExtraction() {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(runExtraction, SETTLE_DELAY_MS);
  }

  // ---------------------------------------------------------------------------
  // Initial extraction
  // document_idle guarantees the DOM is ready, but dynamic content may not be.
  // The SETTLE_DELAY_MS timer absorbs that.
  // ---------------------------------------------------------------------------

  scheduleExtraction();

  // ---------------------------------------------------------------------------
  // SPA navigation detection
  // Covers two patterns:
  //   a) URL change detected by a MutationObserver on the document root
  //      (handles React Router, Vue Router, hash-based routing)
  //   b) popstate (browser back/forward)
  // ---------------------------------------------------------------------------

  const navObserver = new MutationObserver(function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      console.debug(TAG, "navigation detected =>", lastUrl);
      scheduleExtraction();
    }
  });

  navObserver.observe(document.documentElement, {
    subtree:   true,
    childList: true,
  });

  window.addEventListener("popstate", function () {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      scheduleExtraction();
    }
  });
})();
