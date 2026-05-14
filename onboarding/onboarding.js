// onboarding.js — Marginalia setup flow
//
// Flow:
//   1. User selects Q1 option → extractionStrategy set, Q2 revealed
//   2. User selects Q2 option → behaviorStrategy set, Q3 revealed, Confirm enabled
//   3. (Optional) User pastes API key in Q3
//   4. "Finish setup" clicked → writes config to chrome.storage.local, closes tab
//
// Storage output:
//   {
//     extractionStrategy: "readability" | "viewport" | "structured",
//     behaviorStrategy:   "mitigate"   | "embrace"  | "erase",
//     onboardingComplete: true,
//     anthropicApiKey:    "sk-ant-…"   (only if entered)
//   }

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var state = {
    extractionStrategy: null,
    behaviorStrategy:   null,
  };

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------

  var q2Section   = document.getElementById("q2");
  var q3Section   = document.getElementById("q3");
  var confirmBtn  = document.getElementById("confirm-btn");
  var footerHint  = document.getElementById("footer-hint");
  var apiKeyInput = document.getElementById("api-key-input");
  var keyToggle   = document.getElementById("key-toggle");
  var q1Options   = document.querySelectorAll('[data-question="q1"] .option');
  var q2Options   = document.querySelectorAll('[data-question="q2"] .option');

  // ---------------------------------------------------------------------------
  // Q1 — extraction strategy
  // ---------------------------------------------------------------------------

  q1Options.forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectOption(q1Options, btn);
      state.extractionStrategy = btn.dataset.value;
      revealSection(q2Section, q2Options);
      updateConfirmState();
    });

    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Q2 — behavior strategy
  // ---------------------------------------------------------------------------

  q2Options.forEach(function (btn) {
    btn.addEventListener("click", function () {
      selectOption(q2Options, btn);
      state.behaviorStrategy = btn.dataset.value;
      revealSection(q3Section, []);  // Q3 has no focusable option buttons to unlock
      updateConfirmState();
    });

    btn.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Q3 — API key (optional)
  // ---------------------------------------------------------------------------

  // Show / hide toggle
  keyToggle.addEventListener("click", function () {
    var showing = apiKeyInput.type === "text";
    apiKeyInput.type = showing ? "password" : "text";
    keyToggle.setAttribute("aria-pressed", String(!showing));
    keyToggle.setAttribute("aria-label", showing ? "Show key" : "Hide key");
  });

  // ---------------------------------------------------------------------------
  // Confirm button
  // ---------------------------------------------------------------------------

  confirmBtn.addEventListener("click", function () {
    if (!state.extractionStrategy || !state.behaviorStrategy) return;

    confirmBtn.disabled = true;
    confirmBtn.textContent = "Saving…";

    var config = {
      extractionStrategy: state.extractionStrategy,
      behaviorStrategy:   state.behaviorStrategy,
      onboardingComplete: true,
    };

    // Only save the key if the user actually entered something.
    var key = apiKeyInput ? apiKeyInput.value.trim() : "";
    if (key) {
      config.anthropicApiKey = key;
    }

    chrome.storage.local.set(config, function () {
      if (chrome.runtime.lastError) {
        console.error("[Marginalia onboarding] storage write failed:", chrome.runtime.lastError);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "Finish setup";
        footerHint.textContent = "Something went wrong — please try again.";
        return;
      }

      // Close this tab; the extension is now configured.
      window.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Marks the clicked button as selected and deselects its siblings.
   */
  function selectOption(group, selected) {
    group.forEach(function (btn) {
      btn.setAttribute("aria-checked", "false");
    });
    selected.setAttribute("aria-checked", "true");
  }

  /**
   * Reveals a hidden question section with a CSS transition.
   * Fires only once — subsequent triggers are no-ops.
   *
   * @param {HTMLElement} section     The section to reveal.
   * @param {NodeList}    focusTargets Buttons inside the section to make keyboard-reachable.
   */
  function revealSection(section, focusTargets) {
    if (!section || section.classList.contains("question--visible")) return;

    section.classList.remove("question--hidden");

    // rAF pair ensures the browser has painted the initial state before
    // adding the visible class, so the CSS transition actually plays.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        section.classList.add("question--visible");
        section.removeAttribute("aria-hidden");

        focusTargets.forEach(function (btn) {
          btn.removeAttribute("tabindex");
        });

        // Focus the first interactive element in the revealed section.
        var first = section.querySelector("button, input, a");
        if (first) first.focus();
      });
    });
  }

  /**
   * Enables the Confirm button only when Q1 and Q2 are answered.
   * (Q3 is optional — key can always be added later in Settings.)
   */
  function updateConfirmState() {
    var q1Done = state.extractionStrategy !== null;
    var q2Done = state.behaviorStrategy   !== null;
    var ready  = q1Done && q2Done;

    confirmBtn.disabled = !ready;
    confirmBtn.setAttribute("aria-disabled", String(!ready));

    if (ready) {
      footerHint.textContent = "Ready! Add an API key above or click Finish setup.";
    } else if (q1Done) {
      footerHint.textContent = "One more — answer question 2 to continue.";
    } else {
      footerHint.textContent = "Answer both questions to continue.";
    }
  }

}());
