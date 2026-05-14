// tests/context.test.mjs
// Run: node --test tests/context.test.mjs

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './helpers/load-script.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// Chrome storage mock
// Each test suite gets a fresh store so state never bleeds between tests.
// ─────────────────────────────────────────────────────────────────────────────

function makeChromeMock() {
  const store = {};
  return {
    storage: {
      session: {
        get(key, cb)  { cb({ [key]: store[key] }); },
        set(obj, cb)  { Object.assign(store, obj); if (cb) cb(); },
      },
    },
    runtime: {
      lastError: null,
    },
  };
}

// Helper: build a valid chunk payload
function mkChunk(overrides = {}) {
  return {
    success:   true,
    title:     'Test Article',
    url:       'https://example.com',
    text:      'Some text.',
    timestamp: Date.now(),
    wordCount: 2,
    strategy:  'readability',
    behavior:  'neutral',
    signals:   { dwell: 30, scrollVelocity: 0, active: true },
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RC_Context.getChunks', () => {

  it('returns an empty array when no chunks have been added', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    // Let the hydration promise settle
    await new Promise(resolve => setTimeout(resolve, 0));
    const chunks = sb.RC_Context.getChunks();
    assert.ok(Array.isArray(chunks));
    assert.equal(chunks.length, 0);
  });

  it('returns a copy — mutating the result does not affect internal state', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await sb.RC_Context.addChunk(mkChunk());
    const first  = sb.RC_Context.getChunks();
    first.push({ injected: true });
    const second = sb.RC_Context.getChunks();
    assert.equal(second.length, 1, 'internal state should still have exactly 1 chunk');
  });

});

describe('RC_Context.addChunk', () => {

  it('stores a chunk and getChunks returns it', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await sb.RC_Context.addChunk(mkChunk({ title: 'My Article' }));
    const chunks = sb.RC_Context.getChunks();
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].title, 'My Article');
  });

  it('ignores null or non-object payloads without throwing', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await assert.doesNotReject(() => sb.RC_Context.addChunk(null));
    await assert.doesNotReject(() => sb.RC_Context.addChunk('string'));
    assert.equal(sb.RC_Context.getChunks().length, 0);
  });

  it('truncates chunk text to 4 000 characters', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await sb.RC_Context.addChunk(mkChunk({ text: 'x'.repeat(6000) }));
    const stored = sb.RC_Context.getChunks()[0];
    assert.ok(stored.text.length <= 4000,
      `expected text ≤ 4000 chars, got ${stored.text.length}`);
  });

  it('normalises a missing timestamp to a recent epoch value', async () => {
    const sb    = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    const before = Date.now();
    await sb.RC_Context.addChunk(mkChunk({ timestamp: undefined }));
    const after  = Date.now();
    const stored = sb.RC_Context.getChunks()[0];
    assert.ok(stored.timestamp >= before && stored.timestamp <= after,
      'timestamp should be set to roughly Date.now()');
  });

  it('evicts chunks older than the 10-minute rolling window', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));

    const OLD_TS = Date.now() - 11 * 60 * 1000; // 11 minutes ago
    await sb.RC_Context.addChunk(mkChunk({ title: 'Old',     timestamp: OLD_TS }));
    await sb.RC_Context.addChunk(mkChunk({ title: 'Current', timestamp: Date.now() }));

    const chunks = sb.RC_Context.getChunks();
    assert.equal(chunks.length, 1);
    assert.equal(chunks[0].title, 'Current');
  });

  it('caps at 10 chunks — oldest evicted when the limit is exceeded', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));

    for (let i = 0; i < 12; i++) {
      await sb.RC_Context.addChunk(mkChunk({ title: `Article ${i}`, timestamp: Date.now() }));
    }

    const chunks = sb.RC_Context.getChunks();
    assert.ok(chunks.length <= 10, `expected ≤ 10 chunks, got ${chunks.length}`);
    // The oldest entries (Article 0, Article 1) should have been evicted
    const titles = chunks.map(c => c.title);
    assert.ok(!titles.includes('Article 0'));
    assert.ok(!titles.includes('Article 1'));
  });

});

describe('RC_Context.getSessionSummary', () => {

  it('returns an object with the expected shape', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await sb.RC_Context.addChunk(mkChunk({ signals: { dwell: 60, scrollVelocity: 0, active: true } }));
    const summary = sb.RC_Context.getSessionSummary();
    assert.ok(typeof summary === 'object');
    assert.ok('chunk_count'         in summary);
    assert.ok('total_dwell_seconds' in summary);
    assert.ok('titles'              in summary);
    assert.ok('behaviors'           in summary);
  });

  it('reports the correct chunk count', async () => {
    const sb = loadScript('lib/context.js', { chrome: makeChromeMock() });
    await new Promise(resolve => setTimeout(resolve, 0));
    await sb.RC_Context.addChunk(mkChunk());
    await sb.RC_Context.addChunk(mkChunk());
    const summary = sb.RC_Context.getSessionSummary();
    assert.equal(summary.chunk_count, 2);
  });

});
