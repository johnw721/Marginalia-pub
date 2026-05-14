# Portfolio Note

This repository is a **portfolio reference build** of Marginalia, a Chrome extension that functions as an AI reading companion. The extension watches passive reading signals — dwell time, scroll velocity, keyboard activity — classifies behavior using a multi-signal threshold system, and opens a structured conversation anchored to both what the article says and how you were reading it.

The commercial version of this project is maintained in a private repository. This build exists to demonstrate the engineering and design decisions behind it.

## What this repo demonstrates

- **Chrome Manifest V3 service worker architecture** — message routing between content scripts, a background service worker, and a side panel page, with no shared DOM context
- **Cloudflare Worker + KV rate limiter** — a proxy that fronts the Anthropic API with per-user daily quotas enforced in Workers KV, deployed via Wrangler
- **Behavioral classification pipeline** — a three-strategy system (Mitigate / Embrace / Erase) that classifies reading behavior and injects pre-classified signals or raw signals into the prompt depending on strategy
- **Prompt engineering depth** — 9 system prompts with structured response markers, insight guards, question tension rules, turn-awareness, and article-type detection
- **Zero-dependency test suite** — 79 tests across four suites run with `node --test`, no framework, no build step

See [ARCHITECTURE.md](ARCHITECTURE.md) for the full system design and [BEHAVIOR_SYSTEM.md](BEHAVIOR_SYSTEM.md) for the classification design.
