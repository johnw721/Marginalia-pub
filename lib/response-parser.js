// lib/response-parser.js — Response splitting utility
//
// Extracted so it can be loaded independently and unit-tested in Node without
// a browser or DOM.  sidebar.js delegates to this module rather than housing
// the logic inline.
//
// Loaded as a plain <script> in sidebar/sidebar.html (before sidebar.js).
// Exposes window.RC_ResponseParser = { splitResponse }.
//
// Algorithm
// ─────────
// Primary: look for [OBSERVATION], [INSIGHT], [QUESTION] markers that the
// system prompts instruct the model to emit.  When all three are present in
// the correct order, the text between each marker is extracted and the label
// itself is stripped — the sidebar renders its own "Observation / Insight /
// Question" labels via CSS.
//
// Fallback: sentence-boundary split (used for short conversational replies
// that do not follow the structured format).

(function () {
  "use strict";

  /**
   * Splits a Claude response into { observation, insight, question }.
   *
   * @param  {string} text  Raw response text from the API.
   * @returns {{ observation: string, insight: string, question: string }}
   */
  function splitResponse(text) {
    const cleaned = (text || "").replace(/\s+/g, " ").trim();

    // ── Marker-based split (primary) ─────────────────────────────────────────
    const OBS_RE = /\[OBSERVATION\]/i;
    const INS_RE = /\[INSIGHT\]/i;
    const QUE_RE = /\[QUESTION\]/i;

    const obsMatch = OBS_RE.exec(cleaned);
    const insMatch = INS_RE.exec(cleaned);
    const queMatch = QUE_RE.exec(cleaned);

    if (
      obsMatch && insMatch && queMatch &&
      obsMatch.index < insMatch.index &&
      insMatch.index < queMatch.index
    ) {
      const obsText = cleaned.slice(obsMatch.index + obsMatch[0].length, insMatch.index).trim();
      const insText = cleaned.slice(insMatch.index + insMatch[0].length, queMatch.index).trim();
      const queText = cleaned.slice(queMatch.index + queMatch[0].length).trim();
      return { observation: obsText, insight: insText, question: queText };
    }

    // ── Sentence-boundary fallback ────────────────────────────────────────────
    if (!cleaned) return { observation: "", insight: "", question: "" };

    const sentencePattern = /(?<=[.!?])\s+(?=[A-Z"'])/g;
    const sentences = cleaned.split(sentencePattern).map(function (s) {
      return s.trim();
    }).filter(Boolean);

    if (sentences.length === 0) return { observation: cleaned, insight: "", question: "" };
    if (sentences.length === 1) return { observation: cleaned, insight: "", question: "" };
    if (sentences.length === 2) {
      return { observation: sentences[0], insight: "", question: sentences[1] };
    }
    return {
      observation: sentences[0],
      insight:     sentences.slice(1, -1).join(" "),
      question:    sentences[sentences.length - 1],
    };
  }

  window.RC_ResponseParser = { splitResponse };

  console.debug("[RC response-parser] module loaded");
})();
