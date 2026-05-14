# Privacy Policy — Marginalia

**Last updated: May 2026**

Marginalia is a Chrome extension that helps you think more deeply about what you read. This policy explains what information the extension accesses, how it is used, and what happens to it.

---

## Summary (plain English)

- Marginalia reads page content and observes basic reading signals (how long you spend on a page, how fast you scroll).
- That information is sent to the Anthropic AI API — only when you click "Discuss this" or send a message.
- Nothing is sent to any server run by the developer. Nothing is sold. Nothing is tracked.
- Your API key is stored in your browser and sent only to Anthropic.
- All local data stays on your device and can be cleared at any time.

---

## 1. What data the extension accesses

### Page content
When you visit a web page, Marginalia's content script extracts the article text (or the visible text on screen, depending on your chosen strategy). This text is held temporarily in the browser's session storage. It is never written to disk or sent anywhere without your explicit action.

### Reading behavior signals
Marginalia records three signals while you read:

| Signal | What it measures | How it's used |
|---|---|---|
| Dwell time | Seconds of active attention on the page (keyboard/mouse present; capped at 300 s) | Classified as deep, skim, or neutral reading |
| Scroll velocity | Pixels per second over the last 3 seconds | Contributes to deep/skim classification |
| Activity flag | Whether keyboard or mouse input was detected | Prevents counting idle tabs |

These signals are never sent anywhere on their own. They are included in the message sent to the Anthropic API only when you initiate a conversation.

### API key
If you choose to supply an Anthropic API key, it is stored in `chrome.storage.local` — a private, sandboxed storage area inside your browser. It is never transmitted to any server other than `api.anthropic.com` as part of authenticated API requests.

### Saved highlights
Passages you save with the ⭐ button are stored in `chrome.storage.local`. They stay on your device and are never transmitted anywhere.

### No other data
Marginalia does not collect:
- Your name, email address, or any account information
- Browsing history beyond the current page being read
- Precise location
- Any data from pages where you do not actively use the extension

---

## 2. How data is used

When you click "Discuss this" or send a follow-up message, Marginalia sends a request to the Anthropic API (`api.anthropic.com`) containing:

- The extracted article text (or your selected passage)
- The page title and URL
- Your reading signals (dwell time, scroll velocity, activity flag), if your chosen behavior persona uses them
- Conversation history from the current session (up to 8 messages, for follow-ups)

This data is used solely to generate the AI response that appears in the sidebar. It is not used for any other purpose by this extension.

**Anthropic's data handling:** Anthropic may process and temporarily retain API request data according to their own terms of service and privacy policy. You should review [Anthropic's Privacy Policy](https://www.anthropic.com/privacy) and [Terms of Service](https://www.anthropic.com/terms) before using this extension with a personal API key.

---

## 3. Data sharing

Marginalia does not sell, rent, or share your data with any third party, with one exception:

- **Anthropic API** — the content of your reading and the generated AI response pass through Anthropic's API as described above. This is the core function of the extension; it cannot work without it.

If you use the optional Cloudflare Worker proxy (a self-hosted demo mode), your request passes through that proxy instead of reaching `api.anthropic.com` directly. The proxy does not log request content; it only increments a daily counter in Cloudflare KV storage. You control whether to use the proxy.

---

## 4. Data storage and retention

| Data | Where stored | Retention |
|---|---|---|
| Extracted page text | `chrome.storage.session` | Cleared when the browser session ends |
| API key | `chrome.storage.local` | Until you remove it from Settings |
| Highlights | `chrome.storage.local` | Until you delete them or clear all storage |
| Configuration (strategy, mode, tour flag) | `chrome.storage.local` | Until you uninstall the extension |
| Conversation history | In-memory only | Cleared when the sidebar is closed or "Discuss this" starts a new conversation |

---

## 5. Your controls

- **Remove your API key:** Open the sidebar → ⚙ Settings → delete the key field and click Save.
- **Clear highlights:** Open the sidebar → bookmark icon → Clear all.
- **Reset all extension data:** Go to `chrome://extensions` → Marginalia → click the storage icon or remove and reinstall the extension. Alternatively, `chrome.storage.local.clear()` in the DevTools console clears all local data.
- **Disable the extension:** Toggle it off in `chrome://extensions` at any time. No content scripts run while it is disabled.
- **Uninstall:** Removing the extension deletes all locally stored data.

---

## 6. AI model

Marginalia uses **Claude Sonnet 4.5** via the Anthropic API. This model was chosen for its strong reasoning, ability to follow a structured three-part response format (observation → insight → question), and natural conversational tone. The model is not fine-tuned by this extension; behavior is shaped entirely through system prompts. No user data is used to train or fine-tune any model by the extension developer.

---

## 7. Children's privacy

Marginalia is not directed at children under 13. The extension does not knowingly collect information from children.

---

## 8. Changes to this policy

If this policy changes materially, the updated version will be posted at the URL registered with the Chrome Web Store, and the "Last updated" date above will be revised.

---

## 9. Contact

Questions about this privacy policy? Open an issue on the project's GitHub repository or contact the developer through the Chrome Web Store listing.
