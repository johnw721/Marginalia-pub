// tests/mitigate.test.mjs
// Run: node --test tests/mitigate.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadScript } from './helpers/load-script.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// DOM mock
//
// MitigateStrategy._init() attaches event listeners to document and window.
// We mock these as no-ops.  Setting visibilityState: 'hidden' and
// hasFocus: () => false ensures _activeSince stays null after construction,
// so _currentDwellS() = _totalActiveDwellMs / 1000 (no live-time offset).
// This makes it straightforward to test classification thresholds by
// setting _totalActiveDwellMs directly.
// ─────────────────────────────────────────────────────────────────────────────

const mockDocument = {
  visibilityState:   'hidden',
  hasFocus:          () => false,
  addEventListener:  () => {},
};

const mockWindow = {
  scrollY:          0,
  addEventListener: () => {},
};

// The IIFE writes to window.RC, which in the sandbox is sandbox.RC.
// We pre-seed RC so the "window.RC = window.RC || {}" guard preserves it.
const sb = loadScript('lib/behavior/strategies/mitigate.js', {
  document: mockDocument,
  ...mockWindow, // spread scrollY and addEventListener onto the sandbox/window
});

const { MitigateStrategy } = sb.RC;

// Thresholds from mitigate.js (mirrored here so tests are self-documenting)
const DEEP_ACTIVE_DWELL_S  = 90;
const SKIM_ACTIVE_DWELL_S  = 30;
const SKIM_SCROLL_PX_S     = 300;

// Helper: create a strategy with controlled dwell (no live timer offset)
function makeStrat(dwellSeconds = 0) {
  const s = new MitigateStrategy();
  s._activeSince        = null;           // paused — no live offset
  s._totalActiveDwellMs = dwellSeconds * 1000;
  return s;
}

// ─────────────────────────────────────────────────────────────────────────────
// classify() — threshold logic
// ─────────────────────────────────────────────────────────────────────────────

describe('MitigateStrategy.classify() — threshold classification', () => {

  it('dwell < SKIM_ACTIVE_DWELL_S → "skim"', () => {
    const result = makeStrat(15).classify();
    assert.equal(result.behavior, 'skim');
  });

  it('dwell exactly at SKIM_ACTIVE_DWELL_S → "skim" (boundary: ≤ threshold)', () => {
    const result = makeStrat(SKIM_ACTIVE_DWELL_S).classify();
    assert.equal(result.behavior, 'skim');
  });

  it('dwell just above SKIM_ACTIVE_DWELL_S → "neutral"', () => {
    const result = makeStrat(SKIM_ACTIVE_DWELL_S + 1).classify();
    assert.equal(result.behavior, 'neutral');
  });

  it('dwell in neutral band (between 30 and 90 s) → "neutral"', () => {
    const result = makeStrat(60).classify();
    assert.equal(result.behavior, 'neutral');
  });

  it('dwell exactly at DEEP_ACTIVE_DWELL_S → "deep"', () => {
    const result = makeStrat(DEEP_ACTIVE_DWELL_S).classify();
    assert.equal(result.behavior, 'deep');
  });

  it('dwell well above DEEP_ACTIVE_DWELL_S → "deep"', () => {
    const result = makeStrat(200).classify();
    assert.equal(result.behavior, 'deep');
  });

  it('"deep" wins over high scroll velocity when dwell ≥ 90 s', () => {
    const s = makeStrat(DEEP_ACTIVE_DWELL_S);
    // Inject high-velocity scroll events within the rolling window
    const now = Date.now();
    s._scrollEvents = [
      { t: now - 100, dy: 500 },
      { t: now - 50,  dy: 500 },
    ];
    assert.equal(s.classify().behavior, 'deep');
  });

  it('high scroll velocity overrides neutral dwell → "skim"', () => {
    const s = makeStrat(60); // would be neutral without scroll
    const now = Date.now();
    // 1000 px over 50 ms = 20 000 px/s >> SKIM_SCROLL_PX_S
    s._scrollEvents = [
      { t: now - 100, dy: 500 },
      { t: now - 50,  dy: 500 },
    ];
    assert.equal(s.classify().behavior, 'skim');
  });

  it('low scroll velocity does not affect neutral classification', () => {
    const s = makeStrat(60);
    const now = Date.now();
    s._scrollEvents = [
      { t: now - 2000, dy: 10 },
      { t: now - 1000, dy: 10 },
    ];
    assert.equal(s.classify().behavior, 'neutral');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// classify() — signals shape
// ─────────────────────────────────────────────────────────────────────────────

describe('MitigateStrategy.classify() — signals payload', () => {

  it('always returns dwell, scrollVelocity, and active fields', () => {
    const result = makeStrat(45).classify();
    assert.ok('dwell'          in result.signals);
    assert.ok('scrollVelocity' in result.signals);
    assert.ok('active'         in result.signals);
  });

  it('dwell signal matches the configured dwell seconds', () => {
    const result = makeStrat(60).classify();
    assert.equal(result.signals.dwell, 60);
  });

  it('active is false when no interaction events were recorded', () => {
    const s = makeStrat(45);
    s._hasInteracted = false;
    assert.equal(s.classify().signals.active, false);
  });

  it('active is true when _hasInteracted is set', () => {
    const s = makeStrat(45);
    s._hasInteracted = true;
    assert.equal(s.classify().signals.active, true);
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// classify() — manual override
// ─────────────────────────────────────────────────────────────────────────────

describe('MitigateStrategy.setOverride / classify() — manual override', () => {

  it('setOverride("deep") forces "deep" regardless of low dwell', () => {
    const s = makeStrat(5); // would be skim
    s.setOverride('deep');
    assert.equal(s.classify().behavior, 'deep');
  });

  it('setOverride("skim") forces "skim" regardless of high dwell', () => {
    const s = makeStrat(200); // would be deep
    s.setOverride('skim');
    assert.equal(s.classify().behavior, 'skim');
  });

  it('setOverride(null) clears the override and restores threshold logic', () => {
    const s = makeStrat(200);
    s.setOverride('skim');
    assert.equal(s.classify().behavior, 'skim'); // override active
    s.setOverride(null);
    assert.equal(s.classify().behavior, 'deep'); // threshold logic restored
  });

  it('signal values are still real (not overridden) when override is active', () => {
    const s = makeStrat(5);
    s.setOverride('deep');
    const result = s.classify();
    assert.equal(result.behavior, 'deep');
    assert.equal(result.signals.dwell, 5); // actual dwell, not 90
  });

  it('invalid override values are ignored (treated as null)', () => {
    const s = makeStrat(5);
    s.setOverride('invalid_value');
    // Should fall back to threshold logic → skim
    assert.equal(s.classify().behavior, 'skim');
  });

});

// ─────────────────────────────────────────────────────────────────────────────
// classify() — error resilience
// ─────────────────────────────────────────────────────────────────────────────

describe('MitigateStrategy.classify() — error resilience', () => {

  it('does not throw when scroll events array is empty', () => {
    const s = makeStrat(45);
    s._scrollEvents = [];
    assert.doesNotThrow(() => s.classify());
  });

  it('does not throw when scroll events array has only one entry', () => {
    const s = makeStrat(45);
    s._scrollEvents = [{ t: Date.now(), dy: 100 }];
    assert.doesNotThrow(() => s.classify());
  });

});
