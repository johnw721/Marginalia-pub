// lib/api.js — Claude API client (sidebar side)
//
// The actual HTTP request is made by the service worker (background.js),
// not by the sidebar page. This avoids CORS preflight issues and browser-
// detection checks that Anthropic applies to requests from page contexts.
//
// This file is a thin message-passing wrapper. It sends a CALL_CLAUDE
// message to the service worker and resolves/rejects based on the response.
//
// Loaded as a plain <script> in sidebar/sidebar.html.
// Exposes window.RC_API = { callClaude }.
//
// All configuration (model, endpoints, token limits) lives in background.js.

(function () {
  "use strict";

  /**
   * Calls the Claude API via the service worker and returns the reply text.
   *
   * @param {Array<{role: "user"|"assistant", content: string}>} messages
   * @param {string} systemPrompt
   * @returns {Promise<string>}
   */
  async function callClaude(messages, systemPrompt) {
    return new Promise(function (resolve, reject) {
      chrome.runtime.sendMessage(
        { type: "CALL_CLAUDE", payload: { messages, systemPrompt } },
        function (response) {
          if (chrome.runtime.lastError) {
            reject(new Error("NETWORK_ERROR: " + chrome.runtime.lastError.message));
            return;
          }
          if (!response) {
            reject(new Error("NETWORK_ERROR: no response from service worker"));
            return;
          }
          if (!response.ok) {
            reject(new Error(response.error || "UNKNOWN_ERROR"));
            return;
          }
          resolve(response.text);
        }
      );
    });
  }

  window.RC_API = { callClaude };

  console.debug("[Marginalia api] module loaded — routing via service worker");
})();
