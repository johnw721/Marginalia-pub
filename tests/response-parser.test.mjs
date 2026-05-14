// tests/response-parser.test.mjs
// Run: node --test tests/response-parser.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './helpers/load-script.mjs';

const { RC_ResponseParser } = loadScript('lib/response-parser.js');
const { splitResponse } = RC_ResponseParser;

// ─────────────────────────────────────────────────────────────────────────────
// Marker-based split (primary path)
// ─────────────────────────────────────────────────────────────────────────────

describe('marker-based split', () => {

  it('extracts all three sections from a well-formed response', () => {
    const text =
      '[OBSERVATION] You spent nearly two minutes on this piece. ' +
      '[INSIGHT] The author smuggles a normative claim inside an empirical one. ' +
      '[QUESTION] What would it take for you to update your position here?';
    const r = splitResponse(text);
    assert.equal(r.observation, 'You spent nearly two minutes on this piece.');
    assert.equal(r.insight, 'The author smuggles a normative claim inside an empirical one.');
    assert.equal(r.question, 'What would it take for you to update your position here?');
  });

  it('strips the marker labels — they do not appear in the output text', () => {
    const text = '[OBSERVATION] A. [INSIGHT] B. [QUESTION] C?';
    const r = splitResponse(text);
    assert.ok(!r.observation.includes('[OBSERVATION]'));
    assert.ok(!r.insight.includes('[INSIGHT]'));
    assert.ok(!r.question.includes('[QUESTION]'));
  });

  it('is case-insensitive: [observation] / [Insight] / [QUESTION] all work', () => {
    const text = '[observation] First part. [Insight] Middle part. [QUESTION] Last part?';
    const r = splitResponse(text);
    assert.ok(r.observation.includes('First part'));
    assert.ok(r.insight.includes('Middle part'));
    assert.ok(r.question.includes('Last part'));
  });

  it('strips leading and trailing whitespace from each extracted section', () => {
    const text = '[OBSERVATION]   Leading space here.   [INSIGHT]   Middle.   [QUESTION]   Final?   ';
    const r = splitResponse(text);
    assert.equal(r.observation, 'Leading space here.');
    assert.equal(r.insight, 'Middle.');
    assert.equal(r.question, 'Final?');
  });

  it('handles multi-sentence content within a single marker section', () => {
    const text =
      '[OBSERVATION] You read carefully. You also scrolled back twice. ' +
      '[INSIGHT] This connects to a broader tension in the field. ' +
      '[QUESTION] Why does this particular framing keep recurring?';
    const r = splitResponse(text);
    assert.ok(r.observation.includes('You read carefully'));
    assert.ok(r.observation.includes('scrolled back twice'));
    assert.equal(r.question, 'Why does this particular framing keep recurring?');
  });

  it('works when markers appear on separate lines (whitespace is normalised first)', () => {
    const text =
      '[OBSERVATION]\n  You dwelled here.\n' +
      '[INSIGHT]\n  The argument has a hidden premise.\n' +
      '[QUESTION]\n  Is the evidence actually sufficient?';
    const r = splitResponse(text);
    assert.ok(r.observation.includes('dwelled'));
    assert.ok(r.insight.includes('hidden premise'));
    assert.ok(r.question.includes('sufficient'));
  });

  it('falls back to sentence split when only two markers are present', () => {
    // Only OBSERVATION and QUESTION — no INSIGHT marker
    const text = '[OBSERVATION] First part. Some middle bit. [QUESTION] Final question?';
    // Missing INSIGHT → all-three condition fails → sentence fallback activates
    // Sentence split on 3 sentences: obs / middle / question
    const r = splitResponse(text);
    // Just assert we get something non-empty back (exact split depends on fallback)
    assert.ok(typeof r.observation === 'string');
    assert.ok(typeof r.insight    === 'string');
    assert.ok(typeof r.question   === 'string');
    assert.ok(r.observation.length > 0);
  });

  it('falls back when markers are in the wrong order', () => {
    // QUESTION appears before OBSERVATION — order check fails
    const text = '[QUESTION] Last. [OBSERVATION] First. [INSIGHT] Middle.';
    const r = splitResponse(text);
    // Sentence fallback: first sentence becomes observation
    assert.ok(r.observation.length > 0);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Sentence-boundary fallback
// ─────────────────────────────────────────────────────────────────────────────

describe('sentence-boundary fallback', () => {

  it('empty string → all sections are empty strings', () => {
    const r = splitResponse('');
    assert.equal(r.observation, '');
    assert.equal(r.insight, '');
    assert.equal(r.question, '');
  });

  it('null/undefined input → all sections are empty strings', () => {
    const r = splitResponse(null);
    assert.equal(r.observation, '');
    assert.equal(r.insight, '');
    assert.equal(r.question, '');
  });

  it('single sentence → observation only; insight and question are empty', () => {
    const r = splitResponse('Just one sentence here.');
    assert.ok(r.observation.length > 0);
    assert.equal(r.insight, '');
    assert.equal(r.question, '');
  });

  it('two sentences → observation + question; insight is empty', () => {
    const r = splitResponse('First sentence is the observation. Second is the question?');
    assert.ok(r.observation.length > 0);
    assert.equal(r.insight, '');
    assert.ok(r.question.length > 0);
  });

  it('three sentences → first observation, middle insight, last question', () => {
    const r = splitResponse(
      'This is the observation. This is the insight. Is this the question?'
    );
    assert.ok(r.observation.includes('observation'));
    assert.ok(r.insight.includes('insight'));
    assert.ok(r.question.includes('question'));
  });

  it('four sentences → first obs, middle two joined as insight, last question', () => {
    const r = splitResponse(
      'Sentence one. Sentence two. Sentence three. Sentence four?'
    );
    assert.ok(r.observation.includes('one'));
    assert.ok(r.insight.includes('two') && r.insight.includes('three'));
    assert.ok(r.question.includes('four'));
  });

  it('excess whitespace is collapsed before splitting', () => {
    const r = splitResponse('One.   Two.   Three?');
    assert.ok(r.observation.includes('One'));
    assert.ok(r.insight.includes('Two'));
    assert.ok(r.question.includes('Three'));
  });

});
