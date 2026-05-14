# Prompts

← [Back to README](README.md)

---

## The 9 system prompts

Each cell in the 3×3 persona matrix has its own system prompt. The prompt is selected at conversation time by `RC_Prompts.getSystemPrompt(extractionStrategy, behaviorStrategy)` in `lib/prompts.js`.

| | Mitigate | Embrace | Erase |
|---|---|---|---|
| **Readability** | The Analyst | The Enthusiast | The Purist |
| **Viewport** | The Guide | The Explorer | The Surveyor |
| **Structured** | The Researcher | The Scholar | The Annotator |

Each persona has a distinct voice and relationship to behavioral data:

- **Mitigate column** (Analyst / Guide / Researcher) — receive a pre-classified label (`deep`, `skim`, `neutral`) and are prompted to name patterns, surface blind spots, and gently challenge what the label implies about how the user engaged.
- **Embrace column** (Enthusiast / Explorer / Scholar) — receive raw signal numbers with no label and are prompted to form their own read of the situation, celebrating engagement and amplifying curiosity rather than scrutinising it.
- **Erase column** (Purist / Surveyor / Annotator) — receive no behavioral data at all (`tracking:off`) and respond purely as a content assistant, with no reference to how the article was read.

---

## Three-part response structure

Every persona enforces the same structure — the prompts use XML-like section markers to elicit it:

1. **Observation** — something specific noticed about the article or (where applicable) about how it was read. Grounded in the text. Never a summary.
2. **Insight** — an interpretive leap: what the observation implies, connects to, or suggests that isn't stated in the article.
3. **Question** — one open question that takes the conversation forward. Not a quiz; a genuine invitation to think.

The sidebar splits the model's response into these three parts by sentence boundary and renders each with its own colored left-rule and label (amber / teal / violet).

---

## Context block format

`RC_Prompts.buildUserMessage(chunks)` assembles the context block that opens every conversation. It contains:

- The article text (truncated to fit, drawn from the most recent successful chunk)
- A metadata line: `title:`, `url:`, `words:`
- A signals block encoding behavior — format depends on which strategy produced the chunk (see [BEHAVIOR_SYSTEM.md](BEHAVIOR_SYSTEM.md) for the tag format table)

For `manual_selection` chunks the signals block is omitted and a `source:selection` tag is added instead, since dwell and scroll data are meaningless for user-initiated selections.

---

## Conversation history

After the first exchange, subsequent user messages are sent with up to the last 8 turns of API history (`_apiHistory`, capped by `_trimHistory()`). The first message in the history always contains the full context block so the model retains article awareness throughout a multi-turn session.
