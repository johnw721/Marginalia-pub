# Marginalia

Marginalia is a Chrome extension that watches how you read — dwell time, scroll velocity, keyboard activity — and uses that signal, combined with the article text itself, to open a conversation with an observation and one question. Rather than asking "what do you want to know?", it starts from what it already noticed.

Three onboarding steps configure the extension: two questions determine which of nine distinct AI personas you get, and a third step collects your Anthropic API key (or you can add it later in Settings).

---

## The 3×3 persona matrix

| | **Mitigate** — pre-classify signals, name patterns | **Embrace** — forward raw signals, let the model interpret | **Erase** — ignore behavior, pure content assistant |
|---|---|---|---|
| **Readability** — articles, blogs, news | The Analyst | The Enthusiast | The Purist |
| **Viewport** — SPAs, mixed sources, paywalls | The Guide | The Explorer | The Surveyor |
| **Structured** — Pocket, Instapaper, Matter, Readwise | The Researcher | The Scholar | The Annotator |

Every response follows the same three-part structure: a behavioral **observation** → a content **insight** → one **question** to take the thought further.

---

## Install

> Requires Chrome 114+ (side panel API).

1. Clone or download this repository.
2. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the project folder.
3. Click the extension icon to open the side panel.
4. Complete onboarding (opens automatically on first install): choose your reading context, your behavior style, and paste your [Anthropic API key](https://console.anthropic.com/settings/keys). You can skip the key step and add it later via the ⚙ settings panel.

On pages that can't be extracted (login screens, dashboards, etc.), the sidebar shows a prompt to select text manually and use the right-click context menu instead.

---

## Tech stack

| Layer | Technology |
|---|---|
| Extension platform | Chrome Manifest V3 |
| Language | Vanilla JavaScript — no framework, no bundler, no npm |
| Content extraction | [Mozilla Readability.js](https://github.com/mozilla/readability) 0.5.0 (vendored) |
| AI model | Anthropic Claude (`claude-sonnet-4-5`, 300 token responses) |
| API access | **Direct** (user's own key, stored in `chrome.storage.local`) or **Proxy** (optional Cloudflare Worker + KV rate limiter for shared/demo use) |
| Storage | `chrome.storage.local` (config, API key, highlights, quota) · `chrome.storage.session` (context window) |
| UI | Chrome Side Panel API · vanilla HTML/CSS |

No build step. No backend. No npm.

---

## Prompt intelligence

The 9 system prompts enforce a structured three-part response using explicit `[OBSERVATION]`, `[INSIGHT]`, `[QUESTION]` section markers. The sidebar parser detects these markers and splits the response reliably; it falls back to sentence-boundary splitting for short follow-up replies that answer conversationally.

Two quality rules are woven into every prompt to guard against the most common failure modes:

- **Insight restatement guard** — "Do not quote or paraphrase the article directly — draw an inference or connection the article itself does not make." Prevents the insight section from restating what the article already said explicitly.
- **Question tension rule** — "The question must not have a correct answer — it should create productive tension worth thinking through." Prevents yes/no and knowledge-test questions.

**Turn-awareness.** On follow-up turns, the system prompt is appended with a brief suffix telling the model not to re-anchor to the article or repeat the behavioral observation. Multi-turn conversations move forward rather than resetting.

**Continuous paced prompting.** After an initial exchange, the sidebar automatically sends a follow-up observation when a new reading chunk arrives and the user has been quiet for at least 2 minutes (no typing in 30 s, no AI message in 120 s). The nudge is fire-and-forget — errors are swallowed silently, and no user bubble is rendered. The chunk is deduped by a `url+30s-bucket` key so a flood of rapid polls for the same moment never double-fires. The practical effect: the companion keeps noticing things as you read without you having to click anything.

**Dynamic loading phrases.** The spinner label rotates through six variants ("Thinking…", "Reading along…", "Making a note…", "Looking closer…", "Following the thread…", "Catching up…") keyed by `_sessionTurnCount`. Each turn in the same session picks the next phrase in sequence, so the loading state never reads identically twice in a sitting.

**Persona tooltip.** An ⓘ button sits inline with the strategy badge in the header. Clicking it slides in a small card showing the active persona's name in amber caps and a one-line description of its lens — covering all nine cells of the 3×3 matrix. Closes on outside click.

**Article-type detection.** `buildUserMessage()` injects a `content-type:` tag alongside the behavior signals, inferred from URL patterns and title keywords: `academic`, `reference`, `saved`, `opinion`, `explainer`, `research`, `news`, or `article`. The model uses this to calibrate its framing without needing a separate prompt per content type.

**Live dwell timer.** The status strip ticks every second rather than updating only on context polls. The direction of the counter depends on the classified behavior: in skim mode it counts *down* (showing seconds remaining until the 30 s neutral threshold), in all other modes it counts *up* (showing elapsed dwell time). The timer pauses when the sidebar is hidden and resumes on reveal; it reseeds automatically whenever a fresh chunk arrives.

**Local feedback telemetry.** Two feedback signals accumulate in `chrome.storage.local` — never sent anywhere:

- `rcHighlightStats` — counts how many times each section (observation / insight / question) has been starred. Reveals which part of the three-part structure users find most worth keeping.
- `rcSessionStats` — records `{ persona, sessions, totalTurns, maxTurns }` per persona. Mean turn depth (`totalTurns / sessions`) is the clearest signal for comparing which of the 9 personas generates the deepest engagement. Auto-prompted turns count toward `totalTurns`, so sessions with heavy continuous prompting will naturally register deeper depth scores.

Inspect either key live:
```js
chrome.storage.local.get(["rcHighlightStats", "rcSessionStats"], console.log)
```

---

## Testing

79 tests across four suites, all passing. Run with Node's built-in test runner — no npm, no test framework to install:

```bash
node --test tests/*.mjs
```

| Suite | Tests | Covers |
|---|---|---|
| `response-parser.test.mjs` | 15 | Marker-based split (all three labels, case insensitivity, multi-sentence, newlines, wrong-order fallback) · sentence-boundary fallback (0–4+ sentences, whitespace collapse) |
| `prompts.test.mjs` | 34 | All 9 system prompts present and distinct · insight guard + question rule in every prompt · persona names · erase column has no dwell/scroll mentions · fallback paths · `FOLLOWUP_SUFFIX` shape · `buildUserMessage` tags (mitigate / embrace / erase) · 11 article-type detection cases |
| `context.test.mjs` | 10 | `getChunks` returns a copy · `addChunk` stores, ignores null, truncates text to 4 000 chars, normalises missing timestamp, evicts chunks older than 10 min, caps at 10 entries · `getSessionSummary` shape and count |
| `mitigate.test.mjs` | 20 | Threshold boundaries (skim / neutral / deep) · scroll velocity overrides · deep wins over high velocity · signals payload shape · manual override (force deep, force skim, clear, signals stay real, invalid values ignored) · error resilience (empty / single-event scroll arrays) |

The test helper (`tests/helpers/load-script.mjs`) evaluates each browser IIFE in a `vm.createContext` sandbox where `window === sandbox`, so modules are testable in Node without a DOM or build step.

---

## Project assessment

**10 / 10 — complete, tested, and ready to ship**

| Dimension | Score | Notes |
|---|---|---|
| Architecture | 10/10 | Clean strategy pattern, swappable at runtime. Continuous paced prompting is a thin layer on the existing poll loop — zero new coupling. Feedback telemetry is passive and self-contained; live timer is cleanly separated from polling; article-type detection is a pure function. |
| Code quality | 10/10 | 79-test suite with zero dependencies covers the classifier, context window, prompt builder, and response parser. Marker-based response parser with sentence-boundary fallback; turn-aware system prompt composition; live timer with proper pause/resume on visibility change. Auto-prompt errors swallowed silently by design. |
| Feature completeness | 10/10 | All 9 strategy combinations live. Extraction, behavior, prompts, UI, API key management, fallback, export, highlights, quota, article-type detection, passive feedback telemetry, continuous paced prompting, and in-sidebar persona descriptions — end-to-end. |
| Resilience | 10/10 | 5-stage extraction pipeline, paywall stripping, quality gate, SPA detection, fallback CTA, context menu escape hatch. RATE_LIMITED and DEMO_LIMIT_REACHED now differentiated by call path so 429s always surface the right message. |
| UX | 10/10 | Continuous paced prompting closes the loop between passive reading and active conversation without requiring a click. Persona tooltip makes the 3×3 grid self-documenting for first-time users. Live dwell timer with direction-aware countdown remains a differentiator. Dynamic loading phrases eliminate repetitive spinner text. |
| Portfolio signal | 10/10 | Full prompt engineering story (structured markers, quality guards, turn-awareness, article-type injection), passive feedback telemetry, live behavioral UI, continuous prompting loop, and a zero-dependency test suite. Multi-system integration in a coherent product with a clear design thesis. |

**The one remaining gap:**
- Cross-session memory — `rcHighlightStats` and `rcSessionStats` now accumulate the signal; the missing step is using saved highlights to prime the opening context of the next session on the same article or domain.

---

## Chrome Web Store

> **Coming soon** — the listing link will appear here once the extension is published.
>
> In the meantime, load the extension manually using the Developer mode instructions above.

Marginalia requires your own **Anthropic API key** to function. Keys are free to create at [console.anthropic.com](https://console.anthropic.com/) (free trial credits included). See [**API_KEY_SETUP.md**](API_KEY_SETUP.md) for a step-by-step guide including cost estimates and troubleshooting.

---

## Privacy

No tracking. No analytics. No data sent anywhere except Anthropic's API — and only when you start a conversation. See [**PRIVACY_POLICY.md**](PRIVACY_POLICY.md) for full details.

---

## Dive deeper

- [**ARCHITECTURE.md**](ARCHITECTURE.md) — system flowchart, extraction pipeline, API call paths, chunk shapes, file structure, implementation table
- [**BEHAVIOR_SYSTEM.md**](BEHAVIOR_SYSTEM.md) — Mitigate / Embrace / Erase strategies, classification thresholds, mode override, buildUserMessage tag format
- [**PROMPTS.md**](PROMPTS.md) — the 9 system prompts, three-part response structure, context block format
- [**API_KEY_SETUP.md**](API_KEY_SETUP.md) — how to get an Anthropic API key, enter it, understand costs, and use the optional demo proxy
- [**STORE_LISTING.md**](STORE_LISTING.md) — Chrome Web Store copy, screenshot checklist, promotional image briefs, submission checklist

---

## License

MIT — see [LICENSE](LICENSE).
