/**
 * cloudflare-worker/worker.js
 *
 * Anthropic API proxy for Marginalia (portfolio demo).
 *
 * What it does:
 *   1. Receives POST /v1/messages from the Chrome extension sidebar.
 *   2. Enforces a global daily request quota (DAILY_LIMIT) using a KV counter.
 *   3. Forwards the request body to api.anthropic.com, injecting the shared
 *      API key from the ANTHROPIC_API_KEY Worker secret.
 *   4. Returns the Anthropic response (or a quota / error response) to the caller.
 *
 * Environment bindings required (configure in wrangler.toml + Cloudflare dashboard):
 *   RATE_LIMIT          — KV namespace (for the daily request counter)
 *   ANTHROPIC_API_KEY   — Worker secret (set via: wrangler secret put ANTHROPIC_API_KEY)
 *
 * Rate limit behaviour:
 *   - Counter key: "quota:YYYY-MM-DD"  (one key per UTC calendar day)
 *   - Scope: DAILY_LIMIT is a GLOBAL counter shared across all visitors.
 *     To switch to per-IP limiting, change the `quotaKey` line to:
 *       const quotaKey = `quota:${clientIp}:${today}`;
 *     where clientIp = request.headers.get("CF-Connecting-IP") ?? "unknown".
 *   - KV is eventually consistent; concurrent requests may occasionally exceed the
 *     limit by a small margin. Use Durable Objects if strict enforcement is needed.
 *
 * ── KV Reset Mechanism (for self-hosters) ────────────────────────────────────
 *
 * The counter resets automatically — no manual action or cron job is required
 * for basic operation.  Here is how it works and what your options are:
 *
 * Option A — TTL-based expiry (DEFAULT, already in place):
 *   Each counter key has the form "quota:YYYY-MM-DD" (UTC date).  A new request
 *   on a new calendar day creates a fresh key that starts at 0.  The old key
 *   expires after 25 h (expirationTtl: 90000) — long enough to survive the
 *   entire day that created it, short enough to avoid KV clutter.
 *   No configuration changes needed.
 *
 * Option B — Explicit midnight cron (OPTIONAL, for audit trails / alerts):
 *   Add a Workers cron trigger in wrangler.toml (see the commented block there)
 *   and implement the `scheduled()` handler below.  The scheduled handler runs
 *   once at midnight UTC and pre-seeds the new day's key at 0, which:
 *     • Makes the reset time deterministic (00:00 UTC, not whenever the first
 *       request of the new day arrives)
 *     • Gives you a hook to send an alert if the previous day's counter was
 *       close to or above DAILY_LIMIT
 *     • Produces a KV audit log entry you can read from the dashboard
 *   To enable: uncomment the [triggers] block in wrangler.toml and add the
 *   `scheduled` handler to the export default object below.
 *
 * Raising / lowering the limit:
 *   Change DAILY_LIMIT at the top of this file and redeploy with `wrangler deploy`.
 *   No KV changes needed — the counter logic adapts automatically.
 */

// ── Configuration ────────────────────────────────────────────────────────────

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION  = "2023-06-01";
const DAILY_LIMIT        = 50;   // ← change this to raise/lower the global quota

// ── CORS headers ──────────────────────────────────────────────────────────────
// "*" allows requests from chrome-extension:// origins (and any other origin).
// X-RC-* quota headers are explicitly exposed so the extension can read them.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":   "*",
  "Access-Control-Allow-Methods":  "POST, OPTIONS",
  "Access-Control-Allow-Headers":  "Content-Type",
  "Access-Control-Expose-Headers": "X-RC-Requests-Used, X-RC-Requests-Limit",
};

// ── Entry point ───────────────────────────────────────────────────────────────

export default {

  // ── Optional cron handler — midnight UTC quota reset ─────────────────────
  // Uncomment this block AND the [triggers] section in wrangler.toml to enable
  // explicit midnight resets (Option B in the KV Reset Mechanism notes above).
  //
  // async scheduled(controller, env, ctx) {
  //   const today    = new Date().toISOString().slice(0, 10);
  //   const quotaKey = `quota:${today}`;
  //   ctx.waitUntil(
  //     env.RATE_LIMIT.put(quotaKey, "0", { expirationTtl: 25 * 60 * 60 })
  //       .then(() => console.log(`[marginalia-proxy] quota reset for ${today}`))
  //       .catch((err) => console.error("[marginalia-proxy] cron reset error:", err.message))
  //   );
  // },

  async fetch(request, env, ctx) {

    // ── CORS preflight ──────────────────────────────────────────────
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // ── Route guard ─────────────────────────────────────────────────
    const url = new URL(request.url);
    if (url.pathname !== "/v1/messages" || request.method !== "POST") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    // ── Rate limit check ────────────────────────────────────────────
    const today    = new Date().toISOString().slice(0, 10);  // "YYYY-MM-DD" UTC
    const quotaKey = `quota:${today}`;                        // global counter

    let count = 0;
    try {
      const stored = await env.RATE_LIMIT.get(quotaKey);
      count = stored ? parseInt(stored, 10) : 0;
    } catch (kvErr) {
      // KV unavailable — fail open so a storage outage doesn't break the demo.
      console.error("[marginalia-proxy] KV read error:", kvErr.message);
    }

    if (count >= DAILY_LIMIT) {
      return jsonResponse(
        {
          error: {
            type:    "rate_limit_exceeded",
            message: "Demo limit reached. Contact for full version.",
          },
        },
        429,
        {
          "X-RC-Requests-Used":  String(DAILY_LIMIT),
          "X-RC-Requests-Limit": String(DAILY_LIMIT),
        }
      );
    }

    // ── Increment counter (fire-and-forget, TTL = 25 h) ─────────────
    ctx.waitUntil(
      env.RATE_LIMIT
        .put(quotaKey, String(count + 1), { expirationTtl: 25 * 60 * 60 })
        .catch(function (err) {
          console.error("[marginalia-proxy] KV write error:", err.message);
        })
    );

    // ── Parse request body ──────────────────────────────────────────
    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // ── Forward to Anthropic ────────────────────────────────────────
    let anthropicResp;
    try {
      anthropicResp = await fetch(ANTHROPIC_ENDPOINT, {
        method:  "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         env.ANTHROPIC_API_KEY,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      });
    } catch (networkErr) {
      return jsonResponse(
        { error: { type: "network_error", message: networkErr.message } },
        502
      );
    }

    // ── Relay Anthropic response ────────────────────────────────────
    let data;
    try {
      data = await anthropicResp.json();
    } catch (_) {
      return jsonResponse({ error: "Failed to parse Anthropic response" }, 502);
    }

    // Attach quota counters so the extension sidebar can display remaining capacity.
    return jsonResponse(data, anthropicResp.status, {
      "X-RC-Requests-Used":  String(count + 1),
      "X-RC-Requests-Limit": String(DAILY_LIMIT),
    });
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}
