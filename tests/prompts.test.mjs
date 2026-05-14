// tests/prompts.test.mjs
// Run: node --test tests/prompts.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './helpers/load-script.mjs';

const { RC_Prompts } = loadScript('lib/prompts.js');
const { getSystemPrompt, buildUserMessage, FOLLOWUP_SUFFIX } = RC_Prompts;

const EXTRACTION_STRATEGIES = ['readability', 'viewport', 'structured'];
const BEHAVIOR_STRATEGIES   = ['mitigate', 'embrace', 'erase'];

// Helper: create a minimal valid chunk with overrides
function chunk(overrides = {}) {
  return {
    title:     'Test Article',
    url:       'https://example.com/article',
    text:      'Some article text.',
    timestamp: Date.now(),
    wordCount: 3,
    strategy:  'readability',
    behavior:  'neutral',
    signals:   { dwell: 45, scrollVelocity: 100, active: true },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// getSystemPrompt
// ─────────────────────────────────────────────────────────────────────────────

describe('getSystemPrompt', () => {

  it('returns a non-empty string for all 9 valid combinations', () => {
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        const p = getSystemPrompt(ex, bx);
        assert.ok(typeof p === 'string' && p.trim().length > 0,
          `expected non-empty prompt for ${ex}×${bx}`);
      }
    }
  });

  it('every prompt contains all three section markers', () => {
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        const p = getSystemPrompt(ex, bx);
        assert.ok(p.includes('[OBSERVATION]'), `${ex}×${bx} missing [OBSERVATION]`);
        assert.ok(p.includes('[INSIGHT]'),     `${ex}×${bx} missing [INSIGHT]`);
        assert.ok(p.includes('[QUESTION]'),    `${ex}×${bx} missing [QUESTION]`);
      }
    }
  });

  it('every prompt contains the insight restatement guard', () => {
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        const p = getSystemPrompt(ex, bx).toLowerCase();
        assert.ok(
          p.includes('do not quote or paraphrase'),
          `${ex}×${bx} missing insight restatement guard`
        );
      }
    }
  });

  it('every prompt contains the question tension rule', () => {
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        const p = getSystemPrompt(ex, bx).toLowerCase();
        assert.ok(
          p.includes('must not have a correct answer'),
          `${ex}×${bx} missing question tension rule`
        );
      }
    }
  });

  it('each prompt mentions the persona by name', () => {
    const PERSONA_NAMES = {
      readability: { mitigate: 'The Analyst',    embrace: 'The Enthusiast', erase: 'The Purist'    },
      viewport:    { mitigate: 'The Guide',      embrace: 'The Explorer',   erase: 'The Surveyor'  },
      structured:  { mitigate: 'The Researcher', embrace: 'The Scholar',    erase: 'The Annotator' },
    };
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        const p = getSystemPrompt(ex, bx);
        assert.ok(
          p.includes(PERSONA_NAMES[ex][bx]),
          `${ex}×${bx} prompt does not name the persona`
        );
      }
    }
  });

  it('Erase column prompts do not reference dwell time or scroll velocity', () => {
    for (const ex of EXTRACTION_STRATEGIES) {
      const p = getSystemPrompt(ex, 'erase').toLowerCase();
      assert.ok(!p.includes('dwell time'),      `${ex}×erase should not mention dwell time`);
      assert.ok(!p.includes('scroll velocity'), `${ex}×erase should not mention scroll velocity`);
    }
  });

  it('unknown extraction strategy returns non-empty fallback containing markers', () => {
    const p = getSystemPrompt('unknown_strategy', 'mitigate');
    assert.ok(typeof p === 'string' && p.length > 0);
    assert.ok(p.includes('[OBSERVATION]'));
  });

  it('unknown behavior strategy returns non-empty fallback', () => {
    const p = getSystemPrompt('readability', 'unknown_behavior');
    assert.ok(typeof p === 'string' && p.length > 0);
  });

  it('the nine prompts are all distinct strings', () => {
    const seen = new Set();
    for (const ex of EXTRACTION_STRATEGIES) {
      for (const bx of BEHAVIOR_STRATEGIES) {
        seen.add(getSystemPrompt(ex, bx));
      }
    }
    assert.equal(seen.size, 9, 'expected 9 distinct system prompts');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// FOLLOWUP_SUFFIX
// ─────────────────────────────────────────────────────────────────────────────

describe('FOLLOWUP_SUFFIX', () => {

  it('is a non-empty string', () => {
    assert.ok(typeof FOLLOWUP_SUFFIX === 'string' && FOLLOWUP_SUFFIX.trim().length > 0);
  });

  it('references "follow-up" context', () => {
    assert.ok(FOLLOWUP_SUFFIX.toLowerCase().includes('follow-up'));
  });

  it('instructs the model not to re-summarise the article', () => {
    assert.ok(FOLLOWUP_SUFFIX.toLowerCase().includes('article'));
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// buildUserMessage
// ─────────────────────────────────────────────────────────────────────────────

describe('buildUserMessage', () => {

  it('empty array returns the no-context placeholder', () => {
    const msg = buildUserMessage([]);
    assert.ok(msg.toLowerCase().includes('no reading context'));
  });

  it('null returns the no-context placeholder', () => {
    const msg = buildUserMessage(null);
    assert.ok(msg.toLowerCase().includes('no reading context'));
  });

  it('output contains the article title', () => {
    const msg = buildUserMessage([chunk()]);
    assert.ok(msg.includes('Test Article'));
  });

  it('output contains the URL when non-empty', () => {
    const msg = buildUserMessage([chunk()]);
    assert.ok(msg.includes('https://example.com/article'));
  });

  it('URL line is omitted when url is blank', () => {
    const msg = buildUserMessage([chunk({ url: '' })]);
    assert.ok(!msg.includes('URL:'));
  });

  it('content-type tag always appears', () => {
    const msg = buildUserMessage([chunk()]);
    assert.ok(msg.includes('Content-type:'));
  });

  it('mitigate chunk: includes pre-classified behavior label and dwell seconds', () => {
    const msg = buildUserMessage([chunk({
      behavior: 'deep',
      signals:  { dwell: 120, scrollVelocity: 50, active: true },
    })]);
    assert.ok(msg.includes('behavior:deep'));
    assert.ok(msg.includes('dwell:120s'));
  });

  it('embrace chunk: includes behavior:raw and raw signal values, no label', () => {
    const msg = buildUserMessage([chunk({
      behavior: 'embrace',
      signals:  { dwell: 45, scrollVelocity: 200, active: true },
    })]);
    assert.ok(msg.includes('behavior:raw'));
    assert.ok(msg.includes('dwell:45s'));
    assert.ok(msg.includes('active:true'));
    assert.ok(!msg.includes('behavior:neutral') && !msg.includes('behavior:deep'));
  });

  it('erase chunk: includes tracking:off and no dwell value', () => {
    const msg = buildUserMessage([chunk({
      behavior: null,
      signals:  { dwell: 60, scrollVelocity: 0, active: false },
    })]);
    assert.ok(msg.includes('tracking:off'));
    assert.ok(!msg.includes('dwell:'));
  });

  it('text excerpt is truncated at 600 characters with an ellipsis', () => {
    const msg = buildUserMessage([chunk({ text: 'x'.repeat(800) })]);
    assert.ok(msg.includes('…'));
    // Verify the actual excerpt block is no longer than 600 visible chars + '…'
    const excerptStart = msg.indexOf('Excerpt:\n') + 'Excerpt:\n'.length;
    const excerpt = msg.slice(excerptStart).split('\n\n')[0];
    assert.ok(excerpt.length <= 602, 'excerpt should be ≤ 601 chars plus newline');
  });

  it('multiple chunks render as separate --- Chunk N --- blocks', () => {
    const msg = buildUserMessage([chunk({ title: 'First' }), chunk({ title: 'Second' })]);
    assert.ok(msg.includes('--- Chunk 1 ---'));
    assert.ok(msg.includes('--- Chunk 2 ---'));
    assert.ok(msg.includes('First'));
    assert.ok(msg.includes('Second'));
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// Article-type detection (tested via Content-type tag in buildUserMessage)
// ─────────────────────────────────────────────────────────────────────────────

describe('article-type detection', () => {

  function typeFor(url = '', title = '', text = '') {
    const msg = buildUserMessage([chunk({ url, title, text })]);
    const m   = msg.match(/Content-type:\s*(\w+)/);
    return m ? m[1] : null;
  }

  it('arxiv.org URL → academic', () =>
    assert.equal(typeFor('https://arxiv.org/abs/2401.00001'), 'academic'));

  it('pubmed.ncbi URL → academic', () =>
    assert.equal(typeFor('https://pubmed.ncbi.nlm.nih.gov/12345678'), 'academic'));

  it('wikipedia.org URL → reference', () =>
    assert.equal(typeFor('https://en.wikipedia.org/wiki/Test'), 'reference'));

  it('getpocket.com URL → saved', () =>
    assert.equal(typeFor('https://getpocket.com/read/1234'), 'saved'));

  it('instapaper.com URL → saved', () =>
    assert.equal(typeFor('https://www.instapaper.com/read/1234567890'), 'saved'));

  it('/opinion/ URL path → opinion', () =>
    assert.equal(typeFor('https://nytimes.com/2024/01/01/opinion/something.html'), 'opinion'));

  it('"how to" in title → explainer', () =>
    assert.equal(typeFor('https://example.com', 'How to Build a Daily Habit'), 'explainer'));

  it('"tutorial" in title → explainer', () =>
    assert.equal(typeFor('https://example.com', 'Python Tutorial for Beginners'), 'explainer'));

  it('/news/ URL path → news', () =>
    assert.equal(typeFor('https://bbc.com/news/world-12345'), 'news'));

  it('research phrasing in text → research', () =>
    assert.equal(
      typeFor('https://example.com', '', 'Researchers found that daily walks improve memory retention.'),
      'research'
    ));

  it('generic URL with no signals → article', () =>
    assert.equal(typeFor('https://example.com/blog/post-1'), 'article'));

});
