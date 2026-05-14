# Getting and Using Your Anthropic API Key

Marginalia talks to Claude — Anthropic's AI — directly from your browser. To do that, it needs an API key that proves you have an Anthropic account. This guide walks you through getting one and entering it.

---

## Step 1 — Create a free Anthropic account

1. Go to **[console.anthropic.com](https://console.anthropic.com/)** and sign up.
2. Verify your email address.
3. Anthropic gives new accounts **free trial credits** — enough to try Marginalia extensively before any payment is needed.

---

## Step 2 — Create an API key

1. In the Anthropic Console, click **API Keys** in the left sidebar (or go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)).
2. Click **Create Key**.
3. Give it a name — e.g. "Marginalia" — so you can identify it later.
4. Copy the key. It looks like this:

   ```
   sk-ant-api03-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
   ```

   > **Important:** Copy it now. Anthropic only shows the full key once. If you lose it, create a new one.

---

## Step 3 — Enter the key in Marginalia

**During onboarding (first install):**

When Marginalia opens for the first time, the setup page walks you through two questions about your reading style, then shows a field for your API key. Paste it there and click **Finish setup**.

**After setup, or if you skipped it:**

1. Click the Marginalia icon in your Chrome toolbar to open the sidebar.
2. Click the **⚙ gear icon** in the top-right corner of the sidebar.
3. Find the **Anthropic API key** field at the top of the settings panel.
4. Paste your key and click **Save key**.

The placeholder text will change to "Key saved — enter a new one to change", confirming it was stored.

---

## What happens to your key

- It is stored in `chrome.storage.local` — a private, sandboxed storage area inside your browser. Other websites and extensions cannot read it.
- It is sent only to `api.anthropic.com` when you start a conversation in the sidebar.
- It is never sent to any server run by Marginalia's developer.
- To remove it: open Settings → delete the key field and click Save key. The placeholder resets.

---

## Understanding costs

Marginalia uses **Claude Sonnet 4.5** (`claude-sonnet-4-5`) and requests a maximum of **300 tokens per response** — roughly 200–250 words.

**Typical cost per conversation:**

| Action | Approximate tokens | Approximate cost* |
|---|---|---|
| One "Discuss this" (input + response) | ~1,500–3,000 tokens | $0.003–0.006 |
| Follow-up message | ~500–1,000 tokens | $0.001–0.002 |
| Full reading session (5–10 exchanges) | ~10,000 tokens | ~$0.02 |

*Based on Claude Sonnet 4.5 pricing as of 2026. Prices may change — check [anthropic.com/pricing](https://www.anthropic.com/pricing) for current rates.*

For most users, a month of regular use costs well under $1. Free trial credits typically cover several weeks of reading.

**You are responsible for your own API usage and costs.** Marginalia does not add any fees on top of Anthropic's API charges. Monitor your usage at [console.anthropic.com/usage](https://console.anthropic.com/usage).

To set a spending limit, go to **console.anthropic.com → Settings → Billing → Usage limits** and enter a monthly cap.

---

## Troubleshooting

**"No API key found" error in the sidebar:**
You haven't entered a key yet, or it was cleared. Follow Step 3 above.

**"Your API key was rejected" error:**
The key may have been copied incorrectly (missing characters) or deleted from your Anthropic account. Go back to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys), create a new key, and re-enter it.

**"Couldn't reach the server" error:**
Check your internet connection. If the issue persists, Anthropic's API may be experiencing an outage — check [status.anthropic.com](https://status.anthropic.com).

---

## Optional: the demo proxy (no API key required)

If you're evaluating Marginalia without an API key, a developer can deploy a Cloudflare Worker proxy that holds a shared key. This mode has a **global daily request limit** (default: 50 requests/day across all users).

To use a proxy:
1. The developer deploys `cloudflare-worker/worker.js` to Cloudflare (see `ARCHITECTURE.md`).
2. The worker URL is set as `PROXY_ENDPOINT` in `lib/api.js` before the extension is packed.
3. If no API key is stored locally, Marginalia automatically falls back to the proxy.

The settings panel shows "N of 50 proxy requests today" to make the limit visible. When the limit is reached, the sidebar shows "Demo limit reached."

The proxy is intended for demos and portfolio review — not for sustained personal use. For regular use, enter your own API key.
