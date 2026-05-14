# Chrome Web Store Listing — Marginalia

Reference document for the Chrome Web Store developer dashboard.
Copy the text blocks below directly into the corresponding fields.

---

## Store metadata

| Field | Value |
|---|---|
| Extension name | Marginalia |
| Primary category | Productivity |
| Secondary category | Education |
| Language | English (United States) |
| Privacy policy URL | *(replace with your hosted URL — see note below)* |

**Privacy policy note:** The Chrome Web Store requires a publicly hosted privacy policy URL. Host `PRIVACY_POLICY.md` (or an HTML version of it) at a stable URL before submission — e.g. a GitHub Pages link, a Notion page, or a simple static site. Enter that URL in the "Privacy practices" section of the developer dashboard.

---

## Short description

*Maximum 132 characters. Used in search results and the extension grid.*

```
Reads alongside you. Notices what you linger on — then opens an AI conversation with an observation, an insight, and a question.
```

*(128 characters)*

---

## Detailed description

*Paste into the "Detailed description" field. Plain text only — no HTML or Markdown.*

```
Marginalia is an AI reading companion that starts from what it already noticed — not from what you ask.

While you read, it watches three signals: how long you spend on the page, how fast you scroll, and whether you're actively engaged. When you're ready, click "Discuss this" — or just keep reading, and Marginalia will add a new observation on its own after a couple of minutes. Either way, a conversation opens with:

  • An observation about how you were reading
  • An insight about what you were reading
  • One question to take the thought further

──────────────────────────────────────────
HOW IT WORKS
──────────────────────────────────────────

You answer two questions at setup — what kind of content you read (articles, docs, mixed sources) and how you'd like your reading behavior interpreted. Those answers determine which of nine distinct AI personas you get, each with a different tone and a different lens.

Every response follows the same three-part structure. No rambling summaries. No "here are five things to know." Just an observation, an insight, and one question worth sitting with.

──────────────────────────────────────────
FEATURES
──────────────────────────────────────────

  • 9 AI personas — 3 reading contexts × 3 behavior modes (Mitigate, Embrace, Erase)
  • Continuous AI observations — after your first conversation, Marginalia keeps adding notes as you read (paced every 2 minutes, stops when you start typing)
  • Persona tooltip — tap the ⓘ icon next to your strategy badge to see your active persona's name and what it does
  • Manual mode override — switch between Deep, Skim, and Auto mid-session
  • Highlights library — save any section of an AI response with one click
  • Export as Markdown — copy the full conversation to your clipboard
  • Context menu — select any text, right-click → "Discuss selection with Marginalia"
  • Works on pages that can't be extracted — fallback to manual text selection
  • First-use tour — a brief card explains the observation → insight → question format

──────────────────────────────────────────
AI MODEL
──────────────────────────────────────────

Marginalia uses Claude Sonnet 4.5 via the Anthropic API. This model was chosen for its strong reasoning, ability to follow a structured response format, and natural conversational tone. The model is not fine-tuned; behavior is shaped by the system prompts corresponding to your chosen persona.

──────────────────────────────────────────
WHAT IS SENT TO THE API
──────────────────────────────────────────

Only when you click "Discuss this" or send a follow-up message does Marginalia send anything. At that moment it sends: the article text (or your selected passage), the page title and URL, and your reading signals (dwell time, scroll speed, activity flag) — depending on your chosen persona. No personally identifiable information is sent. No data is sent in the background.

──────────────────────────────────────────
YOUR API KEY
──────────────────────────────────────────

Marginalia requires your own Anthropic API key to function. You can get one for free at console.anthropic.com (free trial credits available, then pay-as-you-go at Claude API rates — typically a few cents per day of normal use).

Enter your key in the extension's Settings panel (gear icon in the sidebar). It is stored only in your browser's local storage and is never shared with anyone other than Anthropic's API.

No subscription. No account. No data collection by the extension developer.

──────────────────────────────────────────
PRIVACY
──────────────────────────────────────────

  • No tracking. No analytics. No remote logging.
  • Page content and reading signals stay in your browser unless you start a conversation.
  • Highlights and settings are stored locally and never leave your device.
  • Your API key is stored locally and sent only to api.anthropic.com.
  • Uninstalling the extension deletes all local data.

Full privacy policy: [your hosted URL here]

──────────────────────────────────────────
REQUIREMENTS
──────────────────────────────────────────

  • Chrome 114 or later (required for the Side Panel API)
  • An Anthropic API key (free to obtain at console.anthropic.com)
```

---

## Permissions justification

*The developer dashboard asks you to justify each permission. Use these.*

| Permission | Justification |
|---|---|
| `sidePanel` | The extension's entire UI lives in the Chrome side panel. |
| `storage` | Stores the user's API key, configuration, saved highlights, and session context — all locally in the browser. |
| `activeTab` | Required to run the content script on the current tab (extract article text, observe reading signals). |
| `contextMenus` | Registers the "Discuss selection with Marginalia" right-click menu item so users can manually send selected text to the AI. |
| `host_permissions: https://api.anthropic.com/*` | Required to call the Anthropic Claude API directly from the extension when the user provides their own API key. No other remote host is contacted. |

---

## Screenshots

*Take 3–4 screenshots at 1280×800 (minimum). The Web Store accepts JPEG or 24-bit PNG.*
*Recommended aspect ratio: 16:10 (1280×800) or 16:9 (1280×720).*

### Screenshot checklist

- [ ] **Screenshot 1 — Sidebar in action**
  Open an article (e.g. a long-form piece on The Atlantic or Ars Technica). Read for ~30 seconds, then click "Discuss this". Capture the sidebar showing the three-part AI response (observation / insight / question). Crop to show the sidebar and enough of the article to give context.

- [ ] **Screenshot 2 — Onboarding flow**
  Reload the extension to trigger onboarding. Capture step 1 (extraction strategy) with one option selected. Optionally include a composite showing all three steps side by side.

- [ ] **Screenshot 3 — Highlights library**
  Star two or three passages from an AI response, then open the highlights panel (bookmark icon). Capture the slide-in panel with highlight cards showing section badges and page metadata.

- [ ] **Screenshot 4 — Settings panel**
  Open the settings panel (gear icon). Capture the API key field, extraction/behavior strategy selectors, and the API usage row. If possible, show a key that has been saved (placeholder text visible).

- [ ] **Screenshot 5 — Persona tooltip**
  With the sidebar open on an article, click the ⓘ icon next to the strategy badge. Capture the header area showing the persona name card slid in below the badge row. Crop tightly to the header + tooltip so the persona name and description are readable at store thumbnail size.

### Screenshot tips
- Use a dark, visually interesting article for screenshots — the dark sidebar design reads best against a light article background.
- Zoom Chrome to 100% before capturing.
- On macOS: Cmd+Shift+4, then Space to capture a window.
- On Windows: Win+Shift+S for the snipping tool.
- Add brief caption text to each screenshot using Figma, Canva, or similar — a single sentence describing what the screenshot shows improves store conversion.

---

## Promotional images

*The Web Store requires two promotional images. Neither is mandatory for initial listing, but both increase visibility.*

### Small promotional tile — 440×280 px

Design brief:
- Background: dark (#111110, matching the sidebar)
- Centered wordmark: "Marginalia" in a serif or refined sans-serif, white or warm amber (#c8a96e)
- Tagline below: "Read with a question worth sitting with."
- Subtle decorative element: faint circular glyph (◎) or margin-line motif in amber, very low opacity
- No screenshots — this is a brand tile, not a feature tile

### Marquee promotional image — 1400×560 px

Design brief:
- Left half: dark background with wordmark and tagline (as above, larger)
- Right half: a cropped, slightly blurred screenshot of the sidebar showing the three-part response
- Amber accent line separating the two halves
- Bottom-right corner: "Powered by Claude · claude-sonnet-4-5" in small muted text
- Keep text minimal — the layout itself communicates the product

---

## Category and tags

- **Category:** Productivity
- **Sub-category:** Education (if prompted)
- **Tags / keywords to include in description for discoverability:**
  reading, AI, Claude, Anthropic, article, highlight, annotation, reading companion, focus, comprehension, side panel, reading tool, productivity

---

## Pre-submission checklist

- [ ] Privacy policy is hosted at a stable public URL
- [ ] Privacy policy URL entered in developer dashboard → Privacy practices
- [ ] All four permissions are justified in the dashboard
- [ ] `host_permissions` justification entered (`https://api.anthropic.com/*` — direct API calls with user's own key)
- [ ] Version is `1.0.0` in `manifest.json`
- [ ] Icons exist at `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`
- [ ] At least one screenshot uploaded (1280×800 or 1280×720)
- [ ] Short description is ≤ 132 characters
- [ ] Detailed description does not contain HTML tags
- [ ] Extension tested on a clean Chrome profile (no other extensions)
- [ ] Extension tested with a real Anthropic API key
- [ ] Single ZIP uploaded (no node_modules, no .wrangler, no .DS_Store — see .gitignore)

---

## Model upgrade checklist

The model is pinned to a dated release (`claude-sonnet-4-5-20251101` in `lib/api.js`) rather than a floating alias. This protects the three-part response format — observation / insight / question — that the sidebar parses and color-codes. A model update that changes default formatting behavior would break the UI silently.

Before upgrading to a new model version:

- [ ] Update `CLAUDE_MODEL` and `MAX_TOKENS` in `background.js` to the new dated string
- [ ] Test all 9 persona combinations (3 extraction strategies × 3 behavior strategies)
- [ ] For each combination: verify `_splitResponse()` in `sidebar.js` yields three non-empty sections
- [ ] Test multi-turn conversations (3+ follow-up messages) — check format holds across turns
- [ ] Test the `manual_selection` path (right-click → Discuss selection) — no dwell signals, format may drift
- [ ] Update the model name in `STORE_LISTING.md` (detailed description), `PRIVACY_POLICY.md` (section 6), and `ARCHITECTURE.md`
- [ ] Bump the `version` in `manifest.json` and submit an updated store listing
