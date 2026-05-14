// lib/behavior/strategies/erase.js — EraseStrategy
//
// Disables behavioral observation entirely.  classify() always returns
// behavior: null and empty signals.
//
// The system prompt for the Purist / Surveyor / Annotator personas tells Claude
// to acknowledge what the user read but never to comment on how they read it.
// Passing behavior: null into buildUserMessage() causes prompts.js to omit all
// behavioral tags from the context block, making it impossible for the model to
// accidentally reference dwell time or scroll patterns.
//
// Chosen by users who find behavioral tracking intrusive or who want
// consistent responses regardless of how they happened to read a page.
//
// No signal collection: no DOM listeners are attached, minimising overhead.
//
// Attaches: window.RC.EraseStrategy

(function () {
  "use strict";

  window.RC = window.RC || {};

  function EraseStrategy() {
    this.id = "erase";
    // No _init() — no DOM listeners, no signal state.
  }

  /**
   * Always returns null behavior and empty signals.
   *
   * buildUserMessage() in lib/prompts.js checks for behavior === null and omits
   * all behavioral tags from the context block, keeping the prompt free of any
   * reading-mode framing.
   *
   * @returns {{ behavior: null, signals: {} }}
   */
  EraseStrategy.prototype.classify = function () {
    return {
      behavior: null,
      signals:  {},
    };
  };

  window.RC.EraseStrategy = EraseStrategy;
})();
