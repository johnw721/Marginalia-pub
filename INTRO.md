# Marginalia – AI reading companion (Chrome extension)

## What it does

Marginalia reads alongside you. It notices how long you linger on a paragraph, how fast you scroll, whether you're actively paying attention — then turns that into a conversation.

You don't have to ask it anything. You just read. When you're ready, click a button and Marginalia opens a chat with:

- An **observation** about how you were reading
- An **insight** about what you were reading
- One **question** to keep you thinking

No summaries. No "five things to know." Just a calm, interesting conversation that starts from what it noticed.

---

## Why you might use it

- You read long articles and want someone to talk them through with you.
- You want to catch what you almost noticed — the insight just below the surface.
- You're tired of asking ChatGPT "what does this mean?" and getting a bullet list.

Marginalia doesn't wait for you to ask. It watches, then speaks.

---

## How it works (the simple version)

1. You install the extension (Chrome only, side panel).
2. You answer two quick questions about your reading style.
3. You add your own Anthropic API key (free trial credits included).
4. Read any article. Click "Discuss this" in the sidebar.

That's it. The conversation appears in the side panel.

---

## What you control

- **Your own API key** — you pay Anthropic directly (pennies per session). The extension never sees your key beyond storing it locally.
- **Nine different AI personalities** — choose how much you want the AI to use your reading behavior.
- **Highlights** — save any part of a reply with one click.
- **Export** — copy the whole conversation as Markdown.

---

## Privacy, plainly

- Marginalia does not track you. No analytics. No remote logging.
- Page content and reading signals stay in your browser unless you click "Discuss this."
- Your API key is stored only in Chrome's local storage, sent only to Anthropic.
- Uninstalling the extension deletes everything.

---

## What it costs

- The extension is free (MIT license).
- Anthropic charges a fraction of a cent per conversation. Free trial credits cover weeks of normal use.

---

## A note for the curious

Under the hood, Marginalia uses Claude Sonnet 4.5 and a 5-stage extraction pipeline to read almost any page — paywalls, SPAs, read-later apps. But you don't need to know any of that to use it.

For the full technical picture — architecture, test suite, prompt system, and design decisions — see [README.md](README.md).
