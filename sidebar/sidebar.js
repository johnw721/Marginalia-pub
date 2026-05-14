// sidebar.js — Marginalia sidebar
//
// Responsibilities:
//   - Header: strategy badge, mode dropdown, copy-conversation button,
//             highlights library toggle, settings toggle
//   - Status strip: pulsing dot, article title, dwell time, behavior tag
//   - Settings panel (slide-in): strategy overrides, threshold display,
//             proxy quota bar
//   - Highlights library panel (slide-in): saved passages with per-item delete
//   - "Discuss this" CTA: appears when fresh unread context exists, shows preview
//   - Chat area: within-session message history
//       • AI messages — 3-part marginalia (observation / insight / question)
//                       each part has a ⭐ save-to-highlights button on hover
//       • User messages — right-aligned plain bubble
//       • Loading indicator — inline spinner
//       • Error messages — inline, styled in red
//       • Welcome tour card — shown once to first-time users (dismissed per session)
//   - Input footer: textarea + send button + ⌘↵ shortcut
//   - Multi-turn API history (last 8 messages) passed to Claude
//   - Conversation log → 📋 Copy as Markdown (header clipboard button)
//
// Dependencies (loaded before this file in sidebar.html):
//   ../lib/api.js      → window.RC_API     = { callClaude }
//   ../lib/prompts.js  → window.RC_Prompts = { getSystemPrompt, buildUserMessage }

(function () {
  "use strict";

  // ─────────────────────────────────────────────────────────────────
  // DOM refs — resolved in _boot()
  // ─────────────────────────────────────────────────────────────────

  let settingsToggle, settingsPanel;
  let saveStrategyBtn, strategyStatus;
  let strategyBadge, personaInfoBtn, personaTooltip;
  let modeSelect;
  let statusDot, statusTitle, statusTags;
  let discussCta, discussPreview, discussCtaBtn;
  let fallbackCta;
  let chatArea, emptyState;
  let userInput, sendBtn;
  // Feature: highlights library
  let highlightsToggle, highlightsPanel, highlightsList, highlightsEmpty, clearHighlightsBtn;
  // Feature: copy conversation
  let copyConvBtn;
  // Feature: quota display
  let quotaText, quotaFill;
  // Feature: API key management
  let apiKeyInput, apiKeyToggle, saveApiKeyBtn, apiKeyStatus;

  // ─────────────────────────────────────────────────────────────────
  // State
  // ─────────────────────────────────────────────────────────────────

  let _config = {
    extractionStrategy: "readability",
    behaviorStrategy:   "mitigate",
  };

  let _overrideMode    = "auto";   // "auto" | "deep" | "skim"
  let _isLoading       = false;
  let _latestChunks    = [];      // most recently fetched context chunks
  let _lastDiscussedAt = 0;       // unix ms — timestamp of last "Discuss this"
  let _apiHistory      = [];      // { role, content }[] sent to Claude (capped at 8)
  let _hasMessages     = false;   // whether any chat messages have been appended
  let _pollTimer       = null;
  let _conversationLog = [];      // { role, text } | { role, observation, insight, question }
  let _hasSeenTour     = false;   // one-time welcome tour flag

  // Session depth tracking — records {persona, turns} per conversation to
  // chrome.storage.local ("rcSessionStats") so prompt quality can be assessed
  // over time by looking at which personas generate the deepest conversations.
  let _sessionTurnCount = 0;      // increments on each successful AI reply
  let _sessionPersona   = "";     // "readability×mitigate" etc., set on Discuss

  // Auto-prompt (continuous paced prompting) state ──────────────────────────
  // After an initial exchange, auto-trigger a follow-up observation when a new
  // chunk arrives and enough quiet time has passed (user hasn't typed recently
  // and no AI message has been sent within AUTO_PROMPT_MIN_MS).
  let _lastAiMessageTime  = 0;    // ms — set each time an AI response renders
  let _lastUserInputTime  = 0;    // ms — set each time the user types in the textarea
  let _autoPromptedKey    = null; // "url:bucket" dedup key for the last auto-prompt

  // Live status timer — ticks the dwell counter every second so the user
  // sees real-time seconds rather than a stale snapshot from the last poll.
  // For "skim" behavior the counter counts DOWN toward the neutral threshold;
  // for all other behaviors it counts UP from the last known dwell baseline.
  let _liveTimer     = null;   // setInterval handle
  let _liveBaseDwell = 0;      // dwell (s) recorded at the moment the chunk arrived
  let _liveBaseTime  = 0;      // Date.now() when that chunk arrived (ms)
  let _liveBehavior  = null;   // "skim" | "neutral" | "deep" | "embrace" | null

  // Mirrors SKIM_ACTIVE_DWELL_S in lib/behavior/strategies/mitigate.js.
  // Below this threshold the classified behavior is "skim"; above it the user
  // has spent enough time to be reclassified as "neutral" or "deep" on the
  // next chunk ingestion.  The countdown uses this to show "Xs left to exit skim".
  const SKIM_THRESHOLD_S = 30;

  const POLL_INTERVAL_MS      = 15000;  // check for new context every 15 s
  const API_HISTORY_CAP       = 8;      // keep last 4 exchanges (8 messages)
  const HIGHLIGHTS_KEY        = "rcHighlights";
  const HIGHLIGHTS_CAP        = 50;     // max saved highlights
  const AUTO_PROMPT_MIN_MS    = 120000; // min 2 min between auto-prompts
  const AUTO_PROMPT_DEBOUNCE  = 30000;  // don't auto-prompt if user typed within 30 s

  // ─────────────────────────────────────────────────────────────────
  // Persona names and descriptions — mirrors the 3×3 grid in lib/prompts.js
  // ─────────────────────────────────────────────────────────────────

  const PERSONA_NAMES = {
    readability: { mitigate: "The Analyst",    embrace: "The Enthusiast", erase: "The Purist"    },
    viewport:    { mitigate: "The Guide",      embrace: "The Explorer",   erase: "The Surveyor"  },
    structured:  { mitigate: "The Researcher", embrace: "The Scholar",    erase: "The Annotator" },
  };

  // One-line tooltip descriptions for the persona info card (ⓘ button).
  // Keys are "extraction×behavior" to match the session-tracking convention.
  const PERSONA_DESCRIPTIONS = {
    "readability×mitigate": "Balances content and reading behavior — surfacing blind spots when you skim, deepening observations when you engage.",
    "readability×embrace":  "Celebrates your curiosity and amplifies the threads that caught your attention.",
    "readability×erase":    "Ignores how you read and focuses purely on the substance of the text.",
    "viewport×mitigate":    "Tracks which sections you slowed down for and which you passed quickly — then asks why.",
    "viewport×embrace":     "Honours every pause as a discovery and encourages going deeper into what stopped you.",
    "viewport×erase":       "Maps the content you encountered without interpreting your engagement.",
    "structured×mitigate":  "Examines your engagement with structured documents and surfaces assumptions beneath the data.",
    "structured×embrace":   "Celebrates methodical engagement and connects structured knowledge to broader implications.",
    "structured×erase":     "Annotates content structure and logical claims without behavioral interpretation.",
  };

  function _getPersonaName(extraction, behavior) {
    const row = PERSONA_NAMES[extraction];
    return (row && row[behavior]) || "Marginalia";
  }

  // ─────────────────────────────────────────────────────────────────
  // Dynamic loading phrases — rotated by turn count so the spinner
  // message feels alive rather than static on every response.
  // ─────────────────────────────────────────────────────────────────

  const _LOADING_PHRASES = [
    "Thinking…",
    "Reading along…",
    "Making a note…",
    "Looking closer…",
    "Following the thread…",
    "Catching up…",
  ];

  // ─────────────────────────────────────────────────────────────────
  // Strategy badge
  // ─────────────────────────────────────────────────────────────────

  function _renderStrategyBadge() {
    const name = _getPersonaName(_config.extractionStrategy, _config.behaviorStrategy);
    strategyBadge.textContent =
      _config.extractionStrategy + " · " + _config.behaviorStrategy;
    strategyBadge.setAttribute("title", name);

    // Sync the persona tooltip content (populated when the user opens it).
    if (personaTooltip) {
      const key  = _config.extractionStrategy + "×" + _config.behaviorStrategy;
      const desc = PERSONA_DESCRIPTIONS[key] || "";
      personaTooltip.innerHTML =
        '<div class="rc-persona-tooltip-inner">' +
        '<p class="rc-persona-name">' + name + '</p>' +
        (desc ? '<p class="rc-persona-desc">' + desc + '</p>' : '') +
        '</div>';
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Status strip
  // ─────────────────────────────────────────────────────────────────

  function _updateStatus(chunks) {
    if (!chunks || chunks.length === 0) {
      statusDot.classList.remove("is-active");
      statusTitle.textContent = "No article detected";
      statusTags.textContent  = "";
      _stopLiveTimer();
      return;
    }

    const latest = chunks[chunks.length - 1];

    // Extraction failed — dim the dot and surface a clear label.
    if (latest.success === false) {
      statusDot.classList.remove("is-active");
      statusTitle.textContent = (latest.title || "Page").trim() || "This page";
      statusTags.textContent  = "unreadable";
      _stopLiveTimer();
      return;
    }

    statusDot.classList.add("is-active");
    statusTitle.textContent = (latest.title || "Untitled").trim();

    // Seed the live timer with this chunk's dwell baseline and start ticking.
    // The timer writes statusTags every second; one immediate tick renders
    // the initial value without waiting a full second.
    if (latest.signals && typeof latest.signals.dwell === "number") {
      _liveBaseDwell = latest.signals.dwell;
      _liveBaseTime  = latest.timestamp || Date.now();
      _liveBehavior  = latest.behavior;
      _startLiveTimer();
    } else {
      // No dwell signal (e.g. manual selection) — static display only.
      _stopLiveTimer();
      const parts = [];
      if (latest.behavior && latest.behavior !== "neutral" && latest.behavior !== "embrace") {
        parts.push(latest.behavior);
      }
      if (_overrideMode !== "auto") parts.push("⚡ " + _overrideMode + " mode");
      statusTags.textContent = parts.join(" · ");
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Live dwell timer
  // ─────────────────────────────────────────────────────────────────

  /**
   * Starts the one-second tick if it is not already running.
   * Fires an immediate tick so the display updates without a one-second lag.
   */
  function _startLiveTimer() {
    _tickLiveStatus(); // immediate first render
    if (_liveTimer) return;
    _liveTimer = setInterval(_tickLiveStatus, 1000);
  }

  function _stopLiveTimer() {
    if (_liveTimer) {
      clearInterval(_liveTimer);
      _liveTimer = null;
    }
  }

  /**
   * Recomputes and writes the statusTags string every second.
   *
   * Skim behavior → countdown: shows "Xs · skim" where X decrements toward
   * zero, giving the user a live read on how many more seconds of engagement
   * would push them out of skim classification.  Once the threshold is
   * crossed the display switches to a normal up-count (the behavior label
   * will update to "neutral" or "deep" on the next chunk ingestion).
   *
   * All other behaviors → up-count: shows increasing elapsed dwell time.
   */
  function _tickLiveStatus() {
    if (!statusTags) return;

    const elapsed = (Date.now() - _liveBaseTime) / 1000;
    const dwell   = _liveBaseDwell + elapsed;
    const parts   = [];

    if (_liveBehavior === "skim") {
      const remaining = Math.round(Math.max(0, SKIM_THRESHOLD_S - dwell));
      // Countdown while below threshold; switch to up-count once threshold is crossed.
      parts.push(remaining > 0 ? remaining + "s" : Math.round(dwell) + "s");
      parts.push("skim");
    } else {
      if (dwell >= 0) parts.push(Math.round(dwell) + "s");
      if (_liveBehavior && _liveBehavior !== "neutral" && _liveBehavior !== "embrace") {
        parts.push(_liveBehavior);
      }
    }

    if (_overrideMode !== "auto") parts.push("⚡ " + _overrideMode + " mode");

    statusTags.textContent = parts.join(" · ");
  }

  // ─────────────────────────────────────────────────────────────────
  // Settings panel
  // ─────────────────────────────────────────────────────────────────

  function _toggleSettings() {
    // Close highlights panel if it's open.
    if (highlightsPanel && highlightsPanel.classList.contains("is-open")) {
      _closeHighlightsPanel();
    }

    const isOpen = settingsPanel.classList.toggle("is-open");
    settingsToggle.classList.toggle("is-active", isOpen);
    settingsToggle.setAttribute("aria-expanded", String(isOpen));
    settingsPanel.setAttribute("aria-hidden", String(!isOpen));

    if (isOpen) {
      _syncStrategyRadios();
      _refreshQuota();
    }
  }

  function _syncStrategyRadios() {
    const eRadio = document.querySelector(
      'input[name="extraction"][value="' + _config.extractionStrategy + '"]'
    );
    const bRadio = document.querySelector(
      'input[name="behavior"][value="' + _config.behaviorStrategy + '"]'
    );
    if (eRadio) eRadio.checked = true;
    if (bRadio) bRadio.checked = true;
  }

  // ── Strategy save ────────────────────────────────────────────────

  function _saveStrategy() {
    const eInput = document.querySelector('input[name="extraction"]:checked');
    const bInput = document.querySelector('input[name="behavior"]:checked');

    if (!eInput || !bInput) {
      _setHint(strategyStatus, "Select both strategies.", "error");
      return;
    }

    const extraction = eInput.value;
    const behavior   = bInput.value;

    chrome.storage.local.set(
      { extractionStrategy: extraction, behaviorStrategy: behavior },
      function () {
        _config.extractionStrategy = extraction;
        _config.behaviorStrategy   = behavior;
        _renderStrategyBadge();
        _setHint(strategyStatus, "Applied — badge updated.", "success");
        setTimeout(function () { _setHint(strategyStatus, "", ""); }, 3000);
      }
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Context polling
  // ─────────────────────────────────────────────────────────────────

  function _pollContext() {
    _getContext().then(function (resp) {
      if (!resp.ok || !resp.chunks || resp.chunks.length === 0) {
        _latestChunks = [];
        _updateStatus([]);
        _hideCta();
        _hideFallback();
        return;
      }

      _latestChunks = resp.chunks;
      _updateStatus(resp.chunks);

      const latest = resp.chunks[resp.chunks.length - 1];

      // Extraction failed — show inline fallback hint instead of the CTA.
      if (latest.success === false) {
        _hideCta();
        _showFallback();
        return;
      }

      _hideFallback();

      const chunkTs = latest.timestamp || 0;
      if (chunkTs > _lastDiscussedAt) {
        _showCta(latest);
      } else {
        _hideCta();
      }

      // Continuous paced prompting — auto-trigger a follow-up observation if
      // the user has been reading quietly and enough time has elapsed.
      _maybeAutoPrompt(latest);

    }).catch(function (err) {
      console.warn("[Marginalia sidebar] context poll error:", err);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Continuous paced prompting
  //
  // _maybeAutoPrompt() is called on every successful context poll.
  // It fires _autoDiscuss() at most once per chunk (deduped by a
  // url+30s-bucket key) and only after the user has been quiet for
  // AUTO_PROMPT_DEBOUNCE ms and AUTO_PROMPT_MIN_MS has elapsed since
  // the last AI message.
  //
  // Requirements for an auto-prompt to fire:
  //   1. A prior AI exchange exists (_lastAiMessageTime > 0)
  //   2. The chunk is fresh and successful
  //   3. >= AUTO_PROMPT_MIN_MS since the last AI message
  //   4. >= AUTO_PROMPT_DEBOUNCE since the user last typed
  //   5. This exact chunk hasn't already triggered an auto-prompt
  //   6. No request is currently in-flight
  // ─────────────────────────────────────────────────────────────────

  function _maybeAutoPrompt(chunk) {
    if (!chunk || chunk.success === false) return;
    if (_isLoading)                         return; // in-flight — wait
    if (_lastAiMessageTime === 0)           return; // no prior AI exchange

    var now = Date.now();
    if (now - _lastAiMessageTime < AUTO_PROMPT_MIN_MS)   return;
    if (now - _lastUserInputTime < AUTO_PROMPT_DEBOUNCE) return;

    // Bucket the chunk's timestamp to 30-second windows so a flood of
    // rapid polls for the same reading moment only triggers one auto-prompt.
    var bucket   = Math.floor((chunk.timestamp || now) / 30000);
    var chunkKey = (chunk.url || "") + ":" + bucket;
    if (_autoPromptedKey === chunkKey) return; // already handled
    _autoPromptedKey = chunkKey;

    _autoDiscuss();
  }

  /**
   * Sends an automatic follow-up observation to Claude without any user
   * action.  Runs silently — errors are swallowed so the auto-prompt never
   * surfaces a red error card to the user (the next manual interaction will
   * succeed independently).
   *
   * The user-side "turn" is NOT shown as a bubble and NOT logged to
   * _conversationLog — only the AI response is rendered.
   */
  async function _autoDiscuss() {
    if (_isLoading) return;

    var chunks = _latestChunks;
    if (!chunks || chunks.length === 0) return;

    // Suppress the manual CTA since we're about to send automatically.
    _hideCta();
    _lastDiscussedAt = Date.now();
    _setLoading(true);

    var loadingEl = _appendLoading();

    try {
      var systemPrompt =
        RC_Prompts.getSystemPrompt(_config.extractionStrategy, _config.behaviorStrategy) +
        RC_Prompts.FOLLOWUP_SUFFIX;

      var contextContent = RC_Prompts.buildUserMessage(chunks);

      // Inject a nudge as a user turn so the model understands why it's being
      // called again without an explicit user question.
      var nudge = {
        role:    "user",
        content: contextContent +
          "\n\n[The user has continued reading — add one brief new observation without repeating prior insights.]",
      };
      _apiHistory.push(nudge);
      _trimHistory();

      var reply = await RC_API.callClaude(_apiHistory, systemPrompt);

      _apiHistory.push({ role: "assistant", content: reply });
      _trimHistory();

      _lastAiMessageTime = Date.now();
      _sessionTurnCount++;
      _recordSessionDepth();

      loadingEl.remove();
      _appendAiMessage(reply);

    } catch (err) {
      loadingEl.remove();
      // Pop the nudge message to keep history clean on failure.
      if (_apiHistory.length && _apiHistory[_apiHistory.length - 1].role === "user") {
        _apiHistory.pop();
      }
      // Silent fail — auto-prompts should never interrupt the user with errors.
      console.warn("[Marginalia sidebar] auto-prompt failed:", err.message);
    } finally {
      _setLoading(false);
    }
  }

  function _startPolling() {
    _pollContext();
    _pollTimer = setInterval(_pollContext, POLL_INTERVAL_MS);

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== "local") return;
      // Re-poll immediately when the background signals a manual selection.
      if (changes.selectionNudge) {
        _pollContext();
      }
      // Refresh quota display when a new API call completes.
      if (changes.rcQuota) {
        _refreshQuota();
      }
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // "Discuss this" CTA
  // ─────────────────────────────────────────────────────────────────

  function _showCta(chunk) {
    const raw     = (chunk.text || "").trim();
    const preview = raw.length > 150 ? raw.slice(0, 150) + "…" : raw;
    discussPreview.textContent = preview || "New reading context available.";
    discussCtaBtn.textContent =
      chunk.strategy === "manual_selection" ? "Discuss selection" : "Discuss this";
    discussCta.hidden = false;
  }

  function _hideCta() {
    discussCta.hidden = true;
  }

  // ─────────────────────────────────────────────────────────────────
  // Fallback CTA (extraction failed — prompt user to select text)
  // ─────────────────────────────────────────────────────────────────

  function _showFallback() {
    fallbackCta.hidden = false;
  }

  function _hideFallback() {
    fallbackCta.hidden = true;
  }

  // ─────────────────────────────────────────────────────────────────
  // "Discuss this" — initiates the conversation
  // ─────────────────────────────────────────────────────────────────

  async function _handleDiscussCta() {
    if (_isLoading) return;

    _hideCta();
    _lastDiscussedAt = Date.now();

    const chunks = _latestChunks;
    if (!chunks || chunks.length === 0) {
      _appendError("NO_CONTEXT");
      return;
    }

    // Fresh conversation — reset the log and session tracking.
    _conversationLog  = [];
    _sessionTurnCount = 0;
    _sessionPersona   = _config.extractionStrategy + "×" + _config.behaviorStrategy;

    _setLoading(true);

    // Show welcome tour on first ever use (before spinner so user reads it while waiting).
    _maybeShowTour();

    // Show the user "turn" as a stub label.
    _appendUserMessage("Discuss this");

    const loadingEl = _appendLoading();

    try {
      const systemPrompt   = RC_Prompts.getSystemPrompt(
        _config.extractionStrategy, _config.behaviorStrategy
      );
      const contextContent = RC_Prompts.buildUserMessage(chunks);

      // Reset history for a fresh conversation.
      _apiHistory = [{ role: "user", content: contextContent }];

      const text = await RC_API.callClaude(_apiHistory, systemPrompt);

      _apiHistory.push({ role: "assistant", content: text });
      _trimHistory();

      _sessionTurnCount = 1; // first successful AI turn
      _recordSessionDepth();

      loadingEl.remove();
      _appendAiMessage(text);

    } catch (err) {
      loadingEl.remove();
      if (_apiHistory.length) _apiHistory.pop();
      _appendError(err.message || "UNKNOWN_ERROR");
      console.error("[Marginalia sidebar] discuss error:", err.message);
    } finally {
      _setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // User input send
  // ─────────────────────────────────────────────────────────────────

  async function _handleSend() {
    if (_isLoading) return;

    const text = userInput.value.trim();
    if (!text) return;

    userInput.value = "";
    _autoResizeTextarea();

    _setLoading(true);
    _appendUserMessage(text);

    let userContent = text;
    if (_apiHistory.length === 0 && _latestChunks.length > 0) {
      userContent =
        RC_Prompts.buildUserMessage(_latestChunks) +
        "\n\n---\nUser follow-up: " + text;
    }

    _apiHistory.push({ role: "user", content: userContent });
    _trimHistory();

    const loadingEl = _appendLoading();

    try {
      // Turn-awareness: on follow-up turns (history has more than the one message
      // we just pushed) append a suffix so the model does not re-anchor to the
      // article or re-state the behavioral observation it already made.
      const isFollowUp   = _apiHistory.length > 1;
      const systemPrompt = RC_Prompts.getSystemPrompt(
        _config.extractionStrategy, _config.behaviorStrategy
      ) + (isFollowUp ? RC_Prompts.FOLLOWUP_SUFFIX : "");

      const reply = await RC_API.callClaude(_apiHistory, systemPrompt);

      _apiHistory.push({ role: "assistant", content: reply });
      _trimHistory();

      _sessionTurnCount++;
      _recordSessionDepth();

      loadingEl.remove();
      _appendAiMessage(reply);

    } catch (err) {
      loadingEl.remove();
      if (_apiHistory.length) _apiHistory.pop();
      _appendError(err.message || "UNKNOWN_ERROR");
      console.error("[Marginalia sidebar] send error:", err.message);
    } finally {
      _setLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Message rendering
  // ─────────────────────────────────────────────────────────────────

  /**
   * Splits a Claude response into { observation, insight, question }.
   * Delegates to lib/response-parser.js (RC_ResponseParser) so the logic
   * can be unit-tested independently of the sidebar DOM context.
   */
  function _splitResponse(text) {
    return RC_ResponseParser.splitResponse(text);
  }

  function _appendAiMessage(rawText) {
    // Record time so the auto-prompt pacing gate has an accurate baseline.
    _lastAiMessageTime = Date.now();

    const parts = _splitResponse(rawText);

    // Track in conversation log for Markdown export.
    _conversationLog.push({
      role:        "assistant",
      observation: parts.observation,
      insight:     parts.insight,
      question:    parts.question,
    });

    const article = document.createElement("article");
    article.className = "rc-msg rc-msg--ai";

    const sections = [
      { key: "observation", label: "Observation", text: parts.observation },
      { key: "insight",     label: "Insight",     text: parts.insight     },
      { key: "question",    label: "Question",    text: parts.question    },
    ];

    sections.forEach(function (s) {
      if (!s.text) return; // skip empty sections

      const div = document.createElement("div");
      div.className = "rc-msg-part rc-msg-part--" + s.key;

      // Label row: section label + ⭐ highlight button
      const labelRow = document.createElement("div");
      labelRow.className = "rc-msg-label-row";

      const labelSpan = document.createElement("span");
      labelSpan.className = "rc-msg-label";
      labelSpan.textContent = s.label;

      const hlBtn = document.createElement("button");
      hlBtn.className = "rc-highlight-btn";
      hlBtn.title     = "Save to highlights";
      hlBtn.setAttribute("aria-label", "Save " + s.label.toLowerCase() + " to highlights");
      hlBtn.textContent = "★";
      hlBtn.addEventListener("click", function () {
        _saveHighlight(s.text, s.key);
        hlBtn.classList.add("is-saved");
        hlBtn.title = "Saved!";
        setTimeout(function () {
          hlBtn.classList.remove("is-saved");
          hlBtn.title = "Save to highlights";
        }, 1500);
      });

      labelRow.appendChild(labelSpan);
      labelRow.appendChild(hlBtn);

      const p = document.createElement("p");
      p.className = "rc-msg-text";
      p.textContent = s.text;

      div.appendChild(labelRow);
      div.appendChild(p);
      article.appendChild(div);
    });

    _mountMessage(article);
    return article;
  }

  function _appendUserMessage(text) {
    // Track in conversation log for Markdown export.
    _conversationLog.push({ role: "user", text: text });

    const div = document.createElement("div");
    div.className = "rc-msg rc-msg--user";

    const p = document.createElement("p");
    p.className = "rc-msg-text";
    p.textContent = text;

    div.appendChild(p);
    _mountMessage(div);
    return div;
  }

  function _appendLoading() {
    const div = document.createElement("div");
    div.className = "rc-msg rc-msg--loading";
    div.setAttribute("aria-live", "polite");

    const spinner = document.createElement("span");
    spinner.className = "rc-spinner";
    spinner.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "rc-loading-text";
    // Rotate through phrases by turn count so the spinner feels dynamic.
    label.textContent = _LOADING_PHRASES[_sessionTurnCount % _LOADING_PHRASES.length];

    div.appendChild(spinner);
    div.appendChild(label);
    _mountMessage(div);
    return div;
  }

  /** Error messages displayed inline in the chat area. */
  const ERROR_COPY = {
    NO_CONTEXT:
      "Nothing to discuss yet — spend a moment reading an article, then come back.",
    NETWORK_ERROR:
      "Couldn't reach the server. Check your connection and try again.",
    DEMO_LIMIT_REACHED:
      "Demo limit reached. Contact for full version.",
    // RATE_LIMITED fires when the user's own Anthropic key hits a rate limit
    // (429 from the direct API path, not the proxy).
    RATE_LIMITED:
      "Rate limited by Anthropic — wait a moment and try again.",
    NO_API_KEY:
      "No API key found. Open Settings (⚙) and enter your Anthropic API key to get started.",
    INVALID_API_KEY:
      "Your API key was rejected by Anthropic. Double-check it in Settings (⚙).",
  };

  function _appendError(code) {
    const knownKey = Object.keys(ERROR_COPY).find(function (k) {
      return code.startsWith(k);
    });
    const message = knownKey
      ? ERROR_COPY[knownKey]
      : "Something went wrong: " + code;

    const div = document.createElement("div");
    div.className = "rc-msg rc-msg--error";

    const p = document.createElement("p");
    p.className = "rc-msg-text";
    p.textContent = message;

    div.appendChild(p);
    _mountMessage(div);
    return div;
  }

  /** Appends a message element to the chat area and handles housekeeping. */
  function _mountMessage(el) {
    if (!_hasMessages) {
      emptyState.hidden = true;
      _hasMessages = true;
    }
    chatArea.appendChild(el);
    _scrollToBottom();
  }

  function _scrollToBottom() {
    chatArea.scrollTop = chatArea.scrollHeight;
  }

  // ─────────────────────────────────────────────────────────────────
  // Loading state (disables input controls while request is in-flight)
  // ─────────────────────────────────────────────────────────────────

  function _setLoading(on) {
    _isLoading             = on;
    sendBtn.disabled       = on;
    userInput.disabled     = on;
    discussCtaBtn.disabled = on;
  }

  // ─────────────────────────────────────────────────────────────────
  // API history cap
  // ─────────────────────────────────────────────────────────────────

  function _trimHistory() {
    if (_apiHistory.length > API_HISTORY_CAP) {
      const first = _apiHistory[0];
      const tail  = _apiHistory.slice(-(API_HISTORY_CAP - 1));
      _apiHistory = [first].concat(tail);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Textarea auto-resize
  // ─────────────────────────────────────────────────────────────────

  function _autoResizeTextarea() {
    userInput.style.height = "auto";
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
  }

  // ─────────────────────────────────────────────────────────────────
  // Chrome runtime helper
  // ─────────────────────────────────────────────────────────────────

  function _getContext() {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: "GET_CONTEXT" }, function (response) {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }
        resolve(response || { ok: false, error: "no response from background" });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Hint helper
  // ─────────────────────────────────────────────────────────────────

  function _setHint(el, msg, type) {
    el.textContent = msg;
    el.className   = "rc-field-hint" + (type ? " is-" + type : "");
  }

  // ─────────────────────────────────────────────────────────────────
  // Export conversation as Markdown (📋 Copy button)
  // ─────────────────────────────────────────────────────────────────

  function _exportConversation() {
    if (_conversationLog.length === 0) {
      // Nothing to copy yet — flash a brief hint.
      const orig = copyConvBtn.title;
      copyConvBtn.title = "No conversation yet";
      setTimeout(function () { copyConvBtn.title = orig; }, 1800);
      return;
    }

    const latest    = _latestChunks.length > 0 ? _latestChunks[_latestChunks.length - 1] : null;
    const pageTitle = (latest && latest.title) || "Untitled";
    const pageUrl   = (latest && latest.url)   || "";
    const date      = new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    const lines = [
      "# Marginalia — " + pageTitle,
      (pageUrl ? "*" + pageUrl + " · " : "*") + date + "*",
      "",
      "---",
      "",
    ];

    _conversationLog.forEach(function (entry) {
      if (entry.role === "user") {
        lines.push("**You:** " + entry.text, "", "---", "");
      } else {
        if (entry.observation) { lines.push("**Observation**", entry.observation, ""); }
        if (entry.insight)     { lines.push("**Insight**",     entry.insight,     ""); }
        if (entry.question)    { lines.push("**Question**",    entry.question,    ""); }
        lines.push("---", "");
      }
    });

    const md = lines.join("\n");

    function _onCopied() {
      const origTitle = copyConvBtn.title;
      copyConvBtn.classList.add("is-active");
      copyConvBtn.title = "Copied!";
      setTimeout(function () {
        copyConvBtn.classList.remove("is-active");
        copyConvBtn.title = origTitle;
      }, 2000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(md).then(_onCopied).catch(function () {
        _fallbackCopy(md);
        _onCopied();
      });
    } else {
      _fallbackCopy(md);
      _onCopied();
    }
  }

  function _fallbackCopy(text) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand("copy");
      ta.remove();
    } catch (_) {}
  }

  // ─────────────────────────────────────────────────────────────────
  // Feedback telemetry — stored locally, never leaves the browser
  // ─────────────────────────────────────────────────────────────────

  /**
   * Records per-persona session depth to chrome.storage.local ("rcSessionStats").
   *
   * Stored shape (array of objects, one per unique persona):
   *   { persona, sessions, totalTurns, maxTurns }
   *
   * "sessions" counts how many times a conversation reached at least one AI
   * reply with this persona.  "totalTurns / sessions" gives the mean depth.
   * Inspect via: chrome.storage.local.get("rcSessionStats", console.log)
   */
  function _recordSessionDepth() {
    if (!_sessionPersona) return;
    const persona = _sessionPersona;
    const turns   = _sessionTurnCount;

    chrome.storage.local.get("rcSessionStats", function (result) {
      const stats   = Array.isArray(result.rcSessionStats) ? result.rcSessionStats : [];
      const entry   = stats.find(function (s) { return s.persona === persona; });

      if (entry) {
        entry.sessions++;
        entry.totalTurns += turns;
        entry.maxTurns    = Math.max(entry.maxTurns || 0, turns);
      } else {
        stats.push({ persona: persona, sessions: 1, totalTurns: turns, maxTurns: turns });
      }

      chrome.storage.local.set({ rcSessionStats: stats });
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Highlights library
  // ─────────────────────────────────────────────────────────────────

  /**
   * Saves a text passage to the highlights library in chrome.storage.local.
   *
   * Also updates the "rcHighlightStats" aggregate ({ observation, insight,
   * question } counts) so you can see which section type users find most
   * worth keeping.  Inspect via:
   *   chrome.storage.local.get("rcHighlightStats", console.log)
   *
   * @param {string} text    The highlighted passage.
   * @param {string} section "observation" | "insight" | "question"
   */
  function _saveHighlight(text, section) {
    const latest    = _latestChunks.length > 0 ? _latestChunks[_latestChunks.length - 1] : null;
    const pageTitle = (latest && latest.title) || "Untitled";
    const pageUrl   = (latest && latest.url)   || "";

    const highlight = {
      id:        "hl_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      text:      text,
      section:   section,
      pageTitle: pageTitle,
      pageUrl:   pageUrl,
      savedAt:   Date.now(),
    };

    chrome.storage.local.get([HIGHLIGHTS_KEY, "rcHighlightStats"], function (result) {
      // ── Save to highlights library ──────────────────────────────────────────
      let all = Array.isArray(result[HIGHLIGHTS_KEY]) ? result[HIGHLIGHTS_KEY] : [];
      // Cap at HIGHLIGHTS_CAP — evict oldest when full.
      all = all.slice(-(HIGHLIGHTS_CAP - 1));
      all.push(highlight);

      // ── Update per-section aggregate stats ─────────────────────────────────
      // Tracks how many times each section type (observation / insight / question)
      // has been saved.  Useful for understanding which part of the three-part
      // structure users find most valuable.
      const stats = result.rcHighlightStats ||
        { observation: 0, insight: 0, question: 0 };
      if (typeof stats[section] === "number") {
        stats[section]++;
      }

      chrome.storage.local.set({ [HIGHLIGHTS_KEY]: all, rcHighlightStats: stats }, function () {
        // Re-render if the panel is open so the new card appears immediately.
        if (highlightsPanel && highlightsPanel.classList.contains("is-open")) {
          _renderHighlights(all);
        }
      });
    });
  }

  function _loadAndRenderHighlights() {
    chrome.storage.local.get(HIGHLIGHTS_KEY, function (result) {
      const all = Array.isArray(result[HIGHLIGHTS_KEY]) ? result[HIGHLIGHTS_KEY] : [];
      _renderHighlights(all);
    });
  }

  function _renderHighlights(highlights) {
    highlightsList.innerHTML = "";

    if (!highlights || highlights.length === 0) {
      highlightsEmpty.hidden = false;
      return;
    }
    highlightsEmpty.hidden = true;

    // Render newest first.
    highlights.slice().reverse().forEach(function (hl) {
      const card = document.createElement("div");
      card.className = "rc-highlight-card";

      const header = document.createElement("div");
      header.className = "rc-highlight-card-header";

      const sectionBadge = document.createElement("span");
      sectionBadge.className =
        "rc-highlight-section rc-highlight-section--" + (hl.section || "observation");
      sectionBadge.textContent = (hl.section || "note").toUpperCase();

      const delBtn = document.createElement("button");
      delBtn.className = "rc-highlight-del";
      delBtn.setAttribute("aria-label", "Remove highlight");
      delBtn.textContent = "×";
      delBtn.addEventListener("click", function () { _deleteHighlight(hl.id); });

      header.appendChild(sectionBadge);
      header.appendChild(delBtn);

      const textP = document.createElement("p");
      textP.className = "rc-highlight-text";
      textP.textContent = hl.text.length > 200 ? hl.text.slice(0, 200) + "…" : hl.text;

      const metaP = document.createElement("p");
      metaP.className = "rc-highlight-meta";
      const dateStr = new Date(hl.savedAt).toLocaleDateString("en-US", {
        month: "short", day: "numeric",
      });
      metaP.textContent = (hl.pageTitle || "Untitled") + " · " + dateStr;

      card.appendChild(header);
      card.appendChild(textP);
      card.appendChild(metaP);
      highlightsList.appendChild(card);
    });
  }

  function _deleteHighlight(id) {
    chrome.storage.local.get(HIGHLIGHTS_KEY, function (result) {
      const all      = Array.isArray(result[HIGHLIGHTS_KEY]) ? result[HIGHLIGHTS_KEY] : [];
      const filtered = all.filter(function (hl) { return hl.id !== id; });
      chrome.storage.local.set({ [HIGHLIGHTS_KEY]: filtered }, function () {
        _renderHighlights(filtered);
      });
    });
  }

  function _clearHighlights() {
    chrome.storage.local.set({ [HIGHLIGHTS_KEY]: [] }, function () {
      _renderHighlights([]);
    });
  }

  // ── Highlights panel open / close ────────────────────────────────

  function _toggleHighlights() {
    // Close settings panel if it's open.
    if (settingsPanel.classList.contains("is-open")) {
      settingsPanel.classList.remove("is-open");
      settingsToggle.classList.remove("is-active");
      settingsToggle.setAttribute("aria-expanded", "false");
      settingsPanel.setAttribute("aria-hidden", "true");
    }

    const isOpen = highlightsPanel.classList.toggle("is-open");
    highlightsToggle.classList.toggle("is-active", isOpen);
    highlightsToggle.setAttribute("aria-expanded", String(isOpen));
    highlightsPanel.setAttribute("aria-hidden", String(!isOpen));

    if (isOpen) _loadAndRenderHighlights();
  }

  function _closeHighlightsPanel() {
    highlightsPanel.classList.remove("is-open");
    highlightsToggle.classList.remove("is-active");
    highlightsToggle.setAttribute("aria-expanded", "false");
    highlightsPanel.setAttribute("aria-hidden", "true");
  }

  // ─────────────────────────────────────────────────────────────────
  // Welcome tour — shown once on first "Discuss this"
  // ─────────────────────────────────────────────────────────────────

  /**
   * Inserts the tour card at the top of the chat area if not yet seen.
   * Called at the START of _handleDiscussCta so users read it while waiting
   * for the API response.
   */
  function _maybeShowTour() {
    if (_hasSeenTour) return;

    const card = document.createElement("div");
    card.className = "rc-tour";
    card.setAttribute("role", "note");

    const title = document.createElement("p");
    title.className = "rc-tour-title";
    title.textContent = "How this works";

    const body = document.createElement("p");
    body.className = "rc-tour-body";
    body.innerHTML =
      "Every response starts with an <em>observation</em> about your reading, " +
      "adds an <em>insight</em>, then closes with a <em>question</em> " +
      "to take the thought further.";

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "rc-tour-btn";
    dismissBtn.textContent = "Got it →";
    dismissBtn.addEventListener("click", function () { _dismissTour(card); });

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(dismissBtn);

    // Insert before any existing chat nodes so it appears at the top.
    chatArea.insertBefore(card, chatArea.firstChild);
    emptyState.hidden = true;
    _hasMessages = true;

    // Trigger CSS entrance transition after a frame.
    requestAnimationFrame(function () { card.classList.add("is-visible"); });
  }

  function _dismissTour(cardEl) {
    _hasSeenTour = true;
    chrome.storage.local.set({ hasSeenTour: true });
    cardEl.classList.remove("is-visible");
    cardEl.classList.add("is-dismissing");
    setTimeout(function () {
      if (cardEl.parentNode) cardEl.remove();
    }, 250);
  }

  // ─────────────────────────────────────────────────────────────────
  // API key management (settings panel)
  // ─────────────────────────────────────────────────────────────────

  function _toggleApiKeyVisibility() {
    const showing = apiKeyInput.type === "text";
    apiKeyInput.type = showing ? "password" : "text";
    apiKeyToggle.setAttribute("aria-pressed", String(!showing));
    apiKeyToggle.setAttribute("aria-label", showing ? "Show key" : "Hide key");
  }

  function _saveApiKey() {
    const key = apiKeyInput.value.trim();

    if (!key) {
      // Empty field submitted — remove any stored key.
      chrome.storage.local.remove("anthropicApiKey", function () {
        apiKeyInput.placeholder = "sk-ant-api03-…";
        _setHint(apiKeyStatus, "Key removed.", "success");
        setTimeout(function () { _setHint(apiKeyStatus, "", ""); }, 3000);
        _refreshQuota();
      });
      return;
    }

    if (!key.startsWith("sk-ant-")) {
      _setHint(apiKeyStatus, "Key should start with sk-ant-…", "error");
      return;
    }

    chrome.storage.local.set({ anthropicApiKey: key }, function () {
      apiKeyInput.value       = "";
      apiKeyInput.placeholder = "Key saved — enter a new one to change";
      _setHint(apiKeyStatus, "Saved! Calls will use your key directly.", "success");
      setTimeout(function () { _setHint(apiKeyStatus, "", ""); }, 3000);
      _refreshQuota();
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // API usage display (settings panel)
  // ─────────────────────────────────────────────────────────────────

  function _refreshQuota() {
    chrome.storage.local.get(["rcQuota", "anthropicApiKey"], function (result) {
      // When the user has their own key, proxy quota is irrelevant.
      if (result.anthropicApiKey) {
        quotaText.textContent = "Using your own API key";
        quotaFill.style.width = "0%";
        quotaFill.classList.remove("is-warning");
        return;
      }

      const q     = result.rcQuota;
      const today = new Date().toISOString().slice(0, 10);

      if (!q || q.date !== today || typeof q.used !== "number") {
        quotaText.textContent  = "—";
        quotaFill.style.width  = "0%";
        quotaFill.classList.remove("is-warning");
        return;
      }

      const pct = Math.min(Math.round((q.used / q.limit) * 100), 100);
      quotaText.textContent = q.used + " of " + q.limit + " proxy requests today";
      quotaFill.style.width = pct + "%";
      quotaFill.classList.toggle("is-warning", pct >= 80);
    });
  }

  // ─────────────────────────────────────────────────────────────────
  // Config load
  // ─────────────────────────────────────────────────────────────────

  function _loadConfig() {
    chrome.storage.local.get(
      ["extractionStrategy", "behaviorStrategy", "behaviorModeOverride",
       "hasSeenTour", "rcQuota", "anthropicApiKey"],
      function (result) {
        if (result.extractionStrategy) _config.extractionStrategy = result.extractionStrategy;
        if (result.behaviorStrategy)   _config.behaviorStrategy   = result.behaviorStrategy;

        _renderStrategyBadge();

        // Restore persisted mode override.
        const savedMode = result.behaviorModeOverride || "auto";
        _applyModeOverride(savedMode, false);

        // Tour flag — persists across sessions so the card only ever shows once.
        _hasSeenTour = !!result.hasSeenTour;

        // Update key input placeholder to reflect whether a key is already saved.
        if (apiKeyInput) {
          apiKeyInput.placeholder = result.anthropicApiKey
            ? "Key saved — enter a new one to change"
            : "sk-ant-api03-…";
        }

        console.debug("[Marginalia sidebar] config loaded:", _config,
          "| override:", savedMode, "| tour seen:", _hasSeenTour,
          "| key stored:", !!result.anthropicApiKey);
      }
    );
  }

  // ── Mode override handlers ────────────────────────────────────────

  /**
   * Applies a mode override: updates state, dropdown appearance, and
   * optionally persists the value to storage.
   *
   * @param {string}  mode    "auto" | "deep" | "skim"
   * @param {boolean} persist Write to chrome.storage.local when true.
   */
  function _applyModeOverride(mode, persist) {
    _overrideMode = mode;
    modeSelect.value = mode;
    modeSelect.classList.toggle("is-override", mode !== "auto");
    if (persist) {
      chrome.storage.local.set({ behaviorModeOverride: mode });
    }
  }

  function _handleModeChange() {
    const mode = modeSelect.value;
    _applyModeOverride(mode, true);
    if (_latestChunks.length > 0) _updateStatus(_latestChunks);
    console.debug("[Marginalia sidebar] mode override set to:", mode);
  }

  // ─────────────────────────────────────────────────────────────────
  // Persona tooltip — ⓘ button next to the strategy badge
  // ─────────────────────────────────────────────────────────────────

  function _togglePersonaTooltip() {
    if (!personaTooltip || !personaInfoBtn) return;
    const isOpen = personaTooltip.classList.toggle("is-open");
    personaInfoBtn.classList.toggle("is-active", isOpen);
    personaInfoBtn.setAttribute("aria-expanded", String(isOpen));
  }

  function _closePersonaTooltip() {
    if (!personaTooltip || !personaInfoBtn) return;
    personaTooltip.classList.remove("is-open");
    personaInfoBtn.classList.remove("is-active");
    personaInfoBtn.setAttribute("aria-expanded", "false");
  }

  // ─────────────────────────────────────────────────────────────────
  // Boot
  // ─────────────────────────────────────────────────────────────────

  function _boot() {
    // ── Resolve DOM refs ──────────────────────────────────────────
    settingsToggle   = document.getElementById("settingsToggle");
    settingsPanel    = document.getElementById("settingsPanel");
    saveStrategyBtn  = document.getElementById("saveStrategyBtn");
    strategyStatus   = document.getElementById("strategyStatus");
    strategyBadge    = document.getElementById("strategyBadge");
    personaInfoBtn   = document.getElementById("personaInfoBtn");
    personaTooltip   = document.getElementById("personaTooltip");
    modeSelect       = document.getElementById("modeSelect");
    statusDot        = document.getElementById("statusDot");
    statusTitle      = document.getElementById("statusTitle");
    statusTags       = document.getElementById("statusTags");
    discussCta       = document.getElementById("discussCta");
    discussPreview   = document.getElementById("discussPreview");
    discussCtaBtn    = document.getElementById("discussCtaBtn");
    fallbackCta      = document.getElementById("fallbackCta");
    chatArea         = document.getElementById("chatArea");
    emptyState       = document.getElementById("emptyState");
    userInput        = document.getElementById("userInput");
    sendBtn          = document.getElementById("sendBtn");
    // Feature: highlights
    highlightsToggle   = document.getElementById("highlightsToggle");
    highlightsPanel    = document.getElementById("highlightsPanel");
    highlightsList     = document.getElementById("highlightsList");
    highlightsEmpty    = document.getElementById("highlightsEmpty");
    clearHighlightsBtn = document.getElementById("clearHighlightsBtn");
    // Feature: copy conversation
    copyConvBtn = document.getElementById("copyConvBtn");
    // Feature: quota
    quotaText = document.getElementById("quotaText");
    quotaFill = document.getElementById("quotaFill");
    // Feature: API key
    apiKeyInput   = document.getElementById("apiKeyInput");
    apiKeyToggle  = document.getElementById("apiKeyToggle");
    saveApiKeyBtn = document.getElementById("saveApiKeyBtn");
    apiKeyStatus  = document.getElementById("apiKeyStatus");

    // ── Event listeners ───────────────────────────────────────────

    modeSelect.addEventListener("change", _handleModeChange);
    settingsToggle.addEventListener("click", _toggleSettings);
    personaInfoBtn.addEventListener("click", _togglePersonaTooltip);
    apiKeyToggle.addEventListener("click", _toggleApiKeyVisibility);
    saveApiKeyBtn.addEventListener("click", _saveApiKey);
    apiKeyInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); _saveApiKey(); }
    });
    highlightsToggle.addEventListener("click", _toggleHighlights);
    clearHighlightsBtn.addEventListener("click", _clearHighlights);
    saveStrategyBtn.addEventListener("click", _saveStrategy);
    discussCtaBtn.addEventListener("click", _handleDiscussCta);
    copyConvBtn.addEventListener("click", _exportConversation);
    sendBtn.addEventListener("click", _handleSend);

    userInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        _handleSend();
      }
    });

    userInput.addEventListener("input", function () {
      _lastUserInputTime = Date.now(); // debounce gate for auto-prompts
      _autoResizeTextarea();
    });

    // Close panels when clicking outside of them.
    document.addEventListener("click", function (e) {
      if (
        settingsPanel.classList.contains("is-open") &&
        !settingsPanel.contains(e.target) &&
        !settingsToggle.contains(e.target)
      ) {
        _toggleSettings();
      }
      if (
        highlightsPanel.classList.contains("is-open") &&
        !highlightsPanel.contains(e.target) &&
        !highlightsToggle.contains(e.target)
      ) {
        _closeHighlightsPanel();
      }
      if (
        personaTooltip.classList.contains("is-open") &&
        !personaTooltip.contains(e.target) &&
        !personaInfoBtn.contains(e.target)
      ) {
        _closePersonaTooltip();
      }
    });

    // ── Initial data load ─────────────────────────────────────────
    _loadConfig();
    _startPolling();

    // Stop live timer when the sidebar page is hidden/unloaded.
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") _stopLiveTimer();
      else if (_liveBaseTime) _startLiveTimer(); // resume on reveal
    });

    console.log("[Marginalia sidebar] loaded");
  }

  document.addEventListener("DOMContentLoaded", _boot);

})();
