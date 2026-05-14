# Behavior System

← [Back to README](README.md)

---

## The three strategies

All three strategies attach (or skip) the same event listeners and return a `classify()` result in the READING_CHUNK. The difference is entirely in what they tell the model.

**MitigateStrategy** runs a threshold-based classifier on the raw signals and returns a categorical label — `"deep"`, `"skim"`, or `"neutral"`. The system prompt receives the pre-decided label plus the raw numbers. The Analyst / Guide / Researcher personas are written to probe that label: *"What does it mean that you skimmed this?"*

**EmbraceStrategy** collects identical signals but skips the classifier entirely. The system prompt receives `behavior:raw` plus the raw numbers and is told to form its own judgment. The Enthusiast / Explorer / Scholar personas celebrate engagement rather than scrutinise it — treating 45 s of dwell as evidence of curiosity rather than neutrality. This is the most intellectually interesting path: the same 45-second session produces a different conversation depending on whether the model is handed a label or allowed to reason about the numbers itself.

**EraseStrategy** attaches no listeners and collects nothing. The system prompt receives only `tracking:off`. The Purist / Surveyor / Annotator personas have no behavioral context and respond purely to the content.

---

## MitigateStrategy — signal collection

Three passive signals are accumulated per page session:

| Signal | How collected | Cap / window |
|---|---|---|
| Active dwell | Pause when tab hides or loses focus; resume on focus/visibility | 300 s hard cap |
| Scroll velocity | Rolling buffer of `{ t, dy }` events; px/s over last 3 s | 3 000 ms window |
| Interaction flag | True on first keydown, mousemove (throttled 200 ms), or click | Sticky — never resets to false |

---

## MitigateStrategy — classification thresholds

| Constant | Default | Effect |
|---|---|---|
| `DEEP_ACTIVE_DWELL_S` | 90 s | Active dwell ≥ this → `"deep"` |
| `SKIM_ACTIVE_DWELL_S` | 30 s | Active dwell ≤ this → `"skim"` |
| `SKIM_SCROLL_PX_S` | 300 px/s | Scroll velocity > this → `"skim"` |
| `ACTIVE_DWELL_CAP_S` | 300 s | Hard cap — prevents tab-abandon inflation |

**"Deep wins" rule:** if active dwell ≥ 90 s, the behavior is `"deep"` regardless of scroll velocity. A user who read thoroughly and then scrolled back fast is still a deep reader.

All constants are at the top of `lib/behavior/strategies/mitigate.js` and easy to tune.

---

## Manual mode override

A `Mode: Auto / ⚡ Deep / ⚡ Skim` dropdown in the sidebar header lets users force a classification label for the session without changing their onboarding config.

The override calls `MitigateStrategy.setOverride(mode)`, which causes `classify()` to return the forced label while still collecting real signals. The behavior factory registers a `storage.onChanged` listener so a mid-session change takes effect on the very next extraction — no page reload required.

The dropdown gains an amber border and color when an override is active (`is-override` CSS class), so the forced state is always visually obvious.

---

## buildUserMessage — behavior tag format

`lib/prompts.js` branches on the `behavior` value when building the context block sent to Claude:

| Strategy | `behavior` value | Tags in prompt |
|---|---|---|
| MitigateStrategy (auto) | `"deep"` / `"skim"` / `"neutral"` | `behavior:deep, dwell:95s, scroll:42px/s` |
| MitigateStrategy (override) | `"deep"` / `"skim"` (forced) | same format — model cannot distinguish override from auto |
| EmbraceStrategy | `"embrace"` | `behavior:raw, dwell:45s, scroll:180px/s, active:true` |
| EraseStrategy | `null` | `tracking:off` (no signal values exposed) |

The `null` branch is the important one: without it, EraseStrategy's `null` behavior would be coerced to `"neutral"` and the Purist / Surveyor / Annotator personas would receive misleading dwell data they weren't designed to use.
