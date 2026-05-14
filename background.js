// background.js — Marginalia service worker
//
// Responsibilities:
//   - On first install: check onboardingComplete in chrome.storage.local;
//     if not set, open onboarding.html in a new tab so the user can configure
//     their extractionStrategy and behaviorStrategy.
//   - Open the side panel when the user clicks the extension icon
//   - Receive READING_CHUNK messages from content.js → RC_Context.addChunk()
//   - Receive GET_CONTEXT messages from the sidebar → return RC_Context.getChunks()
//   - Receive CALL_CLAUDE messages from the sidebar → make the Anthropic API
//     request and return the reply text.
//
// API calls are made here (not in the sidebar page) so they run in the service
// worker context, which bypasses browser-page CORS restrictions and Anthropic's
// browser-detection header requirement entirely.
//
// lib/context.js is loaded via importScripts() and exposes self.RC_Context.

importScripts("lib/context.js");

// ---------------------------------------------------------------------------
// Claude API configuration
// ---------------------------------------------------------------------------

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION  = "2023-06-01";

// Model string. Use the plain alias for now; to pin to a specific snapshot,
// find the exact dated ID in your Anthropic Console under
// console.anthropic.com/settings/limits → "Model" column, then replace this
// with e.g. "claude-sonnet-4-5-20251022". See the upgrade checklist in
// STORE_LISTING.md before changing.
const CLAUDE_MODEL = "claude-sonnet-4-5";
const MAX_TOKENS   = 300;

// Optional Cloudflare Worker proxy (for demo / shared use).
// Replace YOUR_SUBDOMAIN if you deploy one; otherwise leave as-is.
// Used as fallback when no anthropicApiKey is stored locally.
const PROXY_ENDPOINT   = "https://marginalia-proxy.YOUR_SUBDOMAIN.workers.dev/v1/messages";
const PROXY_CONFIGURED = !PROXY_ENDPOINT.includes("YOUR_SUBDOMAIN");

// ---------------------------------------------------------------------------
// Install hook — open onboarding on first install
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== "install") return; // skip updates and browser_update

  chrome.storage.local.get("onboardingComplete", function (result) {
    if (!result.onboardingComplete) {
      chrome.tabs.create({ url: chrome.runtime.getURL("onboarding/onboarding.html") });
    }
  });
});

// ---------------------------------------------------------------------------
// Side panel setup
// ---------------------------------------------------------------------------

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("[Marginalia background] setPanelBehavior failed:", err));

// ---------------------------------------------------------------------------
// Context menu — "Discuss selection with Marginalia"
//
// Registered (or re-registered) on every install/update so the item is always
// present after an extension reload.  removeAll() first prevents duplicate-ID
// errors if the SW is killed and restarted between onInstalled events.
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id:       "rc-discuss-selection",
      title:    "Discuss selection with Marginalia",
      contexts: ["selection"],
    });
    console.debug("[Marginalia background] context menu registered");
  });
});

chrome.contextMenus.onClicked.addListener(function (info) {
  if (info.menuItemId !== "rc-discuss-selection") return;

  // Truncate to 4 000 chars as per spec.
  const selected = (info.selectionText || "").slice(0, 4000).trim();
  if (!selected) return;

  const chunk = {
    success:   true,
    text:      selected,
    title:     info.pageUrl || "",
    url:       info.pageUrl || "",
    timestamp: Date.now(),
    wordCount: selected.split(/\s+/).filter(Boolean).length,
    strategy:  "manual_selection",
    behavior:  "neutral",
    signals:   { dwell: 0, scrollVelocity: 0, active: false },
  };

  // Ingest into the rolling context window (same path as automatic chunks).
  RC_Context.addChunk(chunk);

  // Write a nudge flag so the sidebar's storage.onChanged listener
  // re-polls immediately rather than waiting up to 15 seconds.
  chrome.storage.local.set({ selectionNudge: Date.now() });

  console.info("[Marginalia background] manual selection ingested",
    { words: chunk.wordCount, url: chunk.url });
});

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  switch (message.type) {

    case "READING_CHUNK":
      handleReadingChunk(message.payload, sender);
      break;

    case "GET_CONTEXT":
      // The sidebar needs the current rolling window to build the prompt.
      // getChunks() is synchronous (reads in-memory state); no await needed.
      // We return true to signal we'll call sendResponse asynchronously,
      // even though the call itself is sync — this keeps the channel open
      // safely across any future refactors.
      handleGetContext(sendResponse);
      return true; // keep message channel open for sendResponse

    case "CALL_CLAUDE":
      // API calls are made here (service worker) rather than in the sidebar
      // page to avoid CORS preflight issues and Anthropic's browser-context
      // detection. The service worker fetches on behalf of the sidebar.
      handleCallClaude(message.payload, sendResponse);
      return true; // keep message channel open for async sendResponse

    default:
      console.debug("[Marginalia background] unhandled message type:", message.type);
  }
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Receives an extracted + behavior-tagged chunk from the content script.
 */
function handleReadingChunk(payload, sender) {
  if (!payload) {
    console.warn("[Marginalia background] READING_CHUNK received with no payload");
    return;
  }

  // Fire-and-forget: addChunk is async; we call it without await so the
  // message listener returns immediately.
  RC_Context.addChunk(payload);

  console.info(
    "[Marginalia background] READING_CHUNK ingested",
    {
      strategy:    payload.strategy,
      wordCount:   payload.wordCount,
      title:       payload.title,
      url:         payload.url,
      behavior:    payload.behavior,
      dwell:       payload.signals && payload.signals.dwell,
      tabId:       sender.tab ? sender.tab.id : "unknown",
      textSnippet: (payload.text || "").slice(0, 120) + "…",
    }
  );
}

/**
 * Returns the current rolling context window to the sidebar.
 *
 * RC_Context.getChunks() reads in-memory state synchronously.
 * Wrapped in a try/catch so a misbehaving context module never
 * silently kills the message round-trip.
 *
 * @param {function} sendResponse
 */
function handleGetContext(sendResponse) {
  try {
    const chunks = RC_Context.getChunks();
    sendResponse({ ok: true, chunks: chunks });
    console.debug("[Marginalia background] GET_CONTEXT — returning", chunks.length, "chunk(s)");
  } catch (err) {
    console.error("[Marginalia background] GET_CONTEXT failed:", err);
    sendResponse({ ok: false, error: err.message || "unknown error" });
  }
}

/**
 * Makes the Anthropic API request on behalf of the sidebar.
 *
 * Running the fetch here (service worker) rather than in the sidebar page
 * avoids CORS preflight restrictions and Anthropic's browser-detection check,
 * which blocks requests from page contexts regardless of key validity.
 *
 * @param {{ messages: Array, systemPrompt: string }} payload
 * @param {function} sendResponse  Called with { ok, text } or { ok, error }
 */
async function handleCallClaude(payload, sendResponse) {
  try {
    const text = await _fetchClaude(payload.messages, payload.systemPrompt);
    sendResponse({ ok: true, text });
    console.debug("[Marginalia background] CALL_CLAUDE — success");
  } catch (err) {
    console.error("[Marginalia background] CALL_CLAUDE — error:", err.message);
    sendResponse({ ok: false, error: err.message || "UNKNOWN_ERROR" });
  }
}

/**
 * Core Anthropic API fetch. Prefers the user's stored key (direct call);
 * falls back to the Cloudflare Worker proxy if configured.
 *
 * @param {Array}  messages
 * @param {string} systemPrompt
 * @returns {Promise<string>} The assistant's reply text.
 */
async function _fetchClaude(messages, systemPrompt) {

  // ── Resolve stored API key ──────────────────────────────────────
  const storedKey = await new Promise(function (resolve) {
    chrome.storage.local.get("anthropicApiKey", function (result) {
      resolve((result && result.anthropicApiKey) || null);
    });
  });

  if (!storedKey && !PROXY_CONFIGURED) {
    throw new Error(
      "NO_API_KEY: Open Settings (⚙) and enter your Anthropic API key to get started."
    );
  }

  const requestBody = JSON.stringify({
    model:      CLAUDE_MODEL,
    max_tokens: MAX_TOKENS,
    system:     systemPrompt,
    messages:   messages,
  });

  // ── Make the request ────────────────────────────────────────────
  let response;

  if (storedKey) {
    // Direct call — service worker context bypasses CORS and browser detection.
    try {
      response = await fetch(ANTHROPIC_ENDPOINT, {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         storedKey,
          "anthropic-version": ANTHROPIC_VERSION,
          // Anthropic blocks requests from browser-like contexts (detected via
          // the Origin header) unless this is present. The service worker still
          // sends Origin: chrome-extension://[id], so the header is required.
          // It works here without CORS issues because service workers bypass
          // CORS for URLs listed in host_permissions.
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: requestBody,
      });
    } catch (networkErr) {
      throw new Error("NETWORK_ERROR: " + (networkErr.message || "fetch failed"));
    }
  } else {
    // Proxy fallback.
    try {
      response = await fetch(PROXY_ENDPOINT, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    requestBody,
      });
    } catch (networkErr) {
      throw new Error("NETWORK_ERROR: " + (networkErr.message || "fetch failed"));
    }
  }

  // ── Handle error statuses ───────────────────────────────────────
  if (response.status === 429) {
    // Distinguish between the proxy's own daily quota (no stored key) and
    // Anthropic's per-key rate limit (stored key in use).  Both come back as
    // 429 but they warrant different user-facing messages.
    const isProxyLimit = !storedKey;
    let errorCode = isProxyLimit ? "DEMO_LIMIT_REACHED" : "RATE_LIMITED";
    let message   = isProxyLimit
      ? "Demo limit reached. Contact for full version."
      : "Rate limited by Anthropic — wait a moment and try again.";
    try {
      const body = await response.json();
      if (body.error && body.error.message) message = body.error.message;
    } catch (_) {}
    throw new Error(errorCode + ": " + message);
  }

  if (response.status === 401) {
    throw new Error(
      "INVALID_API_KEY: Your API key was rejected by Anthropic. Check it in Settings (⚙)."
    );
  }

  if (!response.ok) {
    let apiMessage = response.statusText;
    try {
      const errBody = await response.json();
      if (errBody.error && errBody.error.message) apiMessage = errBody.error.message;
    } catch (_) {}
    throw new Error("API_ERROR_" + response.status + ": " + apiMessage);
  }

  // ── Parse response ──────────────────────────────────────────────
  let data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error("PARSE_ERROR: could not parse API response");
  }

  const text = data.content && data.content[0] && data.content[0].text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("EMPTY_RESPONSE: API returned no content");
  }

  // ── Cache proxy quota counters (proxy path only) ────────────────
  if (!storedKey) {
    try {
      const used  = parseInt(response.headers.get("X-RC-Requests-Used")  || "", 10);
      const limit = parseInt(response.headers.get("X-RC-Requests-Limit") || "", 10);
      if (!isNaN(used) && !isNaN(limit)) {
        const today = new Date().toISOString().slice(0, 10);
        chrome.storage.local.set({ rcQuota: { used, limit, date: today } });
      }
    } catch (_) {}
  }

  return text;
}
