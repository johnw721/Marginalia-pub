// tests/helpers/load-script.mjs
//
// Evaluates a browser IIFE script inside a minimal vm sandbox so its exports
// (e.g. window.RC_Prompts) can be accessed in Node tests without a browser.
//
// Usage:
//   const { RC_Prompts } = loadScript('lib/prompts.js');
//   const { RC_Context } = loadScript('lib/context.js', { chrome: mockChrome });

import { readFileSync } from 'node:fs';
import { createContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Root of the extension — two levels up from tests/helpers/
const ROOT = resolve(__dirname, '..', '..');

/**
 * @param {string}  relPath       Path to the script file relative to the extension root.
 * @param {object}  extraGlobals  Additional globals to inject (e.g. { chrome: mockChrome }).
 * @returns {object} The sandbox after the script has run.  Access exports via
 *                   sandbox.RC_Prompts, sandbox.RC_Context, etc.
 */
export function loadScript(relPath, extraGlobals = {}) {
  const absPath = resolve(ROOT, relPath);
  const src     = readFileSync(absPath, 'utf8');

  // Build the sandbox.  window === sandbox so IIFE statements like
  // "window.RC_Prompts = { … }" set sandbox.RC_Prompts directly.
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    ...extraGlobals,
  };
  sandbox.window = sandbox;
  sandbox.self   = sandbox; // service-worker modules write to self, not window

  createContext(sandbox);
  new Script(src).runInContext(sandbox);
  return sandbox;
}
