# Privacy Policy

**Effective date:** June 9, 2026
**Applies to:** Marginalia browser extension (v0.9.0)

Marginalia is a Chrome extension that watches how you read a web page — dwell time, scroll velocity, keyboard activity — and combines that signal with the page's text to start a short conversation with you. This policy explains exactly what data the extension touches, where it goes, and what never leaves your device.

The short version: Marginalia has no analytics, no tracking, and no backend that stores your data. The only data that ever leaves your browser is the content you're reading plus a few behavior signals, sent to Anthropic's API at the moment you have a conversation — and only then.

## What the extension processes

To do its job, Marginalia works with the following on the pages you visit:

**Page content.** When you open the side panel on a page, Marginalia extracts the readable article text (using a five-stage extraction pipeline built on Mozilla's Readability library). On pages it can't auto-extract, you may select text manually and send it via the right-click menu. Either way, this text is held in memory for the current session and is sent to the AI model only when a conversation occurs.

**Reading-behavior signals.** Marginalia observes dwell time, scroll position and velocity, and keyboard activity on the page to classify how you're reading (for example, skimming versus reading closely). Depending on the persona you chose, these signals are either pre-classified into a short label, forwarded as raw numbers, or ignored entirely (the "Erase" personas use no behavior signals at all).

**Your Anthropic API key.** If you use your own key, it is stored locally (see below) and attached to requests so the model can respond.

Marginalia does **not** collect your name, email, account identifiers, browsing history, form contents, passwords, or any data from pages where you have not opened the side panel.

## What stays on your device

The following are stored locally in your browser via the Chrome storage APIs and are **never transmitted anywhere**:

- **Configuration** — your chosen persona, behavior style, and settings (`chrome.storage.local`).
- **Your Anthropic API key** — stored in `chrome.storage.local` on your device. It is sent only to the API endpoint that fulfills your requests, and only as the authorization for those requests.
- **Saved highlights** — any observation, insight, or question you star (`chrome.storage.local`).
- **Quota counters** — local usage counts (`chrome.storage.local`).
- **The active context window** — recent reading chunks for the current session (`chrome.storage.session`), which is cleared when the session ends.
- **Local feedback telemetry** — any usage counters the extension keeps (for example, which parts of responses you star or how deep your sessions run) accumulate only in `chrome.storage.local` and are never sent off the device. They exist solely so the product's own behavior can be understood locally.

Uninstalling the extension removes this local data.

## What leaves your device, and where it goes

Marginalia sends data over the network in exactly one situation: when a conversation turn happens (either because you sent a message, or because the extension's paced-prompting feature sends a follow-up observation after you've been reading quietly for a couple of minutes).

When that happens, the request contains the relevant page text, the behavior signals for your selected persona, and the recent conversation context. It is sent to **Anthropic's Claude API** by one of two paths, depending on how you set the extension up:

**Direct (default).** The request goes straight from your browser to `https://api.anthropic.com`, authenticated with **your own** Anthropic API key. Anthropic processes the request under its own terms and privacy policy. No intermediate server is involved, and the extension's developer never sees your data or your key.

**Proxy (optional, for shared/demo use).** If you configure the optional Cloudflare Worker proxy, your request is sent to that Worker, which forwards it to Anthropic using a shared key and enforces a global daily request limit. The Worker stores only an anonymous per-day request counter (a number, keyed by calendar date) for rate limiting; it does **not** log or store request bodies, page content, conversation text, or IP addresses by default. If you use someone else's hosted proxy, you are also subject to whatever logging that operator has configured, so only use a proxy you trust.

No other third parties receive your data. There are no advertising, analytics, or tracking services in the extension.

## How Anthropic handles the data

Once a request reaches Anthropic's API, it is governed by Anthropic's Commercial Terms and Privacy Policy, not by this document. As a general matter, data submitted through the Anthropic API is not used to train Anthropic's models. For current details, see Anthropic's policies at https://www.anthropic.com/legal and https://privacy.anthropic.com.

## Permissions, and why they're needed

The extension requests these Chrome permissions:

- **`storage`** — to keep your settings, key, highlights, and counters locally on your device.
- **`activeTab` and host access to pages** — to read the text of the page you're currently viewing so it can be discussed. Content scripts run on pages you visit to observe reading behavior, but no data is sent anywhere unless and until a conversation occurs.
- **`sidePanel`** — to show the conversation UI.
- **`contextMenus`** — to provide the right-click "send selected text" fallback.
- **Network access to `https://api.anthropic.com`** — to reach the AI model.

## Children

Marginalia is a general-purpose reading tool and is not directed at children under 13, and it does not knowingly collect data from them.

## Changes to this policy

If the extension's data practices change, this policy will be updated and the effective date above revised. Material changes will be noted in the project's release notes.

## Contact

Questions about this policy can be directed to the project maintainer at johnwalker721@gmail.com.
