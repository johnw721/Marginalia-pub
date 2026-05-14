# Running Marginalia locally

No build step, no npm, no backend required. You need Chrome 114+ and a free Anthropic API key.

## 1. Get an Anthropic API key

1. Go to [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) and sign in (or create a free account).
2. Click **Create Key**, name it anything, and copy the value — you'll paste it in step 4.

Free accounts include trial credits; the extension uses `claude-sonnet-4-5` with 300-token responses, so a typical session costs a fraction of a cent.

## 2. Load the extension

1. Clone or download this repository.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `Marginalia` folder (the one containing `manifest.json`).

The Marginalia icon will appear in your Chrome toolbar.

## 3. Complete onboarding

Onboarding opens automatically on first install. It asks two questions that determine your AI persona:

- **Reading context** — what kind of content you mostly read (articles/blogs, SPAs/mixed sources, or saved items from Pocket/Instapaper/Matter)
- **Behavior style** — how you want the AI to use your reading signals (pre-classify them, forward them raw, or ignore them entirely)

Then paste your Anthropic API key. You can skip the key step and enter it later via the ⚙ settings panel in the sidebar.

## 4. Try it

1. Navigate to any article or long-form page.
2. Click the Marginalia icon to open the side panel (or use the keyboard shortcut shown in `chrome://extensions`).
3. Read for a moment — the extension tracks dwell time and scroll behavior passively.
4. Click **Analyze** (or wait for continuous prompting to fire after ~2 minutes of reading).

The companion opens with a behavioral observation, a content insight, and one question. Reply to continue the conversation.

## 5. Run the tests

```bash
node --test tests/*.mjs
```

79 tests, no setup required beyond Node 18+.

## Optional: deploy the Cloudflare proxy

If you want to run the shared proxy instead of using a direct API key, see [`cloudflare-worker/wrangler.toml`](cloudflare-worker/wrangler.toml) for setup steps and [`cloudflare-worker/.env.example`](cloudflare-worker/.env.example) for the required secret.
