/**
 * Nova SDK CORS Proxy — Cloudflare Worker
 *
 * Replaces the Next.js API route at /api/nova-proxy/[...path].
 * Proxies requests to Nova upstream servers while:
 *  - Injecting the real API key server-side (from Worker secret)
 *  - Enforcing a strict path allowlist
 *  - Applying per-IP rate limiting via Workers KV
 *  - Retrying transient upstream failures with exponential backoff
 *  - Returning structured error responses matching the existing format
 *  - Full CORS preflight support for cross-origin requests
 */

// ============================================================================
// Types
// ============================================================================

export interface Env {
  NOVA_API_KEY: string;
  ALLOWED_ORIGINS: string; // comma-separated list
  RATE_LIMIT: KVNamespace;
}

// ============================================================================
// Constants
// ============================================================================

const AUTH_BASE = 'https://nova-sdk.com';
const MCP_BASE = 'https://nova-mcp.fastmcp.app';

/** Strict allowlist of Nova API paths this proxy handles */
const ALLOWED_PATHS = new Set([
  '/api/auth/session-token',
  '/api/auth/verify',
  '/tools/register_group',
  '/tools/add_group_member',
  '/tools/revoke_group_member',
  '/tools/prepare_upload',
  '/api/finalize-upload',
  '/tools/prepare_retrieve',
  '/tools/auth_status',
  '/attestation',
]);

const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504, 429]);
const BACKOFF_MS = [500, 1000, 2000];

const RATE_LIMIT_WINDOW_S = 60; // 1 minute (KV TTL in seconds)
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

/** Auth headers forwarded from client to upstream */
const FORWARDED_HEADERS = [
  'authorization',
  'x-api-key',
  'x-session-token',
  'x-account-id',
];

// ============================================================================
// CORS
// ============================================================================

function getAllowedOrigins(env: Env): Set<string> {
  return new Set(
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
}

function corsHeaders(
  request: Request,
  env: Env,
): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const allowed = getAllowedOrigins(env);

  if (!allowed.has(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-API-Key, X-Session-Token, X-Account-Id',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function handleOptions(request: Request, env: Env): Response {
  const cors = corsHeaders(request, env);

  if (Object.keys(cors).length === 0) {
    return new Response(null, { status: 403 });
  }

  return new Response(null, { status: 204, headers: cors });
}

// ============================================================================
// Rate Limiting (Workers KV)
// ============================================================================

async function checkRateLimit(
  ip: string,
  kv: KVNamespace,
): Promise<boolean> {
  const key = `rl:${ip}`;
  const raw = await kv.get(key);
  const count = raw ? parseInt(raw, 10) : 0;

  if (count >= RATE_LIMIT_MAX) {
    return false;
  }

  await kv.put(key, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_S,
  });

  return true;
}

// ============================================================================
// Path Routing
// ============================================================================

function isAuthPath(subpath: string): boolean {
  return subpath.startsWith('/api/auth/') || subpath === '/attestation';
}

function getUpstreamUrl(subpath: string): string {
  return isAuthPath(subpath)
    ? `${AUTH_BASE}${subpath}`
    : `${MCP_BASE}${subpath}`;
}

/** Path-based timeout configuration (ms) */
function getTimeout(subpath: string): number {
  if (subpath.startsWith('/api/auth/')) return 10_000; // auth: 10s
  return 30_000; // default: 30s
}

// ============================================================================
// Retry Logic
// ============================================================================

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Non-retryable status — return immediately
      if (!RETRYABLE_STATUSES.has(response.status)) {
        return response;
      }

      // Retryable status — log and retry
      lastError = new Error(`Upstream returned ${response.status}`);
      console.warn(
        `[Nova Proxy] Attempt ${attempt + 1}/${MAX_RETRIES} failed: ${response.status} for ${url}`,
      );
    } catch (err) {
      clearTimeout(timer);
      lastError = err;

      const isAbort =
        err instanceof DOMException && err.name === 'AbortError';
      console.warn(
        `[Nova Proxy] Attempt ${attempt + 1}/${MAX_RETRIES} ${isAbort ? 'timed out' : 'network error'} for ${url}`,
      );
    }

    // Wait before next retry (skip wait on last attempt)
    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
    }
  }

  // All retries exhausted
  throw lastError;
}

// ============================================================================
// Error Responses
// ============================================================================

function errorResponse(
  code: string,
  message: string,
  status: number,
  retryable: boolean,
  durationMs: number,
  cors: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({ error: message, code, retryable }),
    {
      status,
      headers: {
        'Content-Type': 'application/json',
        'X-Proxy-Duration': `${durationMs}ms`,
        ...cors,
      },
    },
  );
}

// ============================================================================
// Main Proxy Handler
// ============================================================================

async function handleProxy(
  request: Request,
  env: Env,
): Promise<Response> {
  const start = Date.now();
  const cors = corsHeaders(request, env);
  const url = new URL(request.url);

  // 1. Extract subpath
  const subpath = url.pathname;
  if (!subpath || subpath === '/') {
    return errorResponse(
      'PATH_NOT_ALLOWED',
      'No path specified',
      404,
      false,
      Date.now() - start,
      cors,
    );
  }

  // 2. Allowlist check
  if (!ALLOWED_PATHS.has(subpath)) {
    return errorResponse(
      'PATH_NOT_ALLOWED',
      `Proxy path not allowed: ${subpath}`,
      404,
      false,
      Date.now() - start,
      cors,
    );
  }

  // 3. Rate limit (CF-Connecting-IP is most reliable on Cloudflare)
  const clientIp =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';

  const allowed = await checkRateLimit(clientIp, env.RATE_LIMIT);
  if (!allowed) {
    return errorResponse(
      'RATE_LIMITED',
      'Too many requests',
      429,
      true,
      Date.now() - start,
      cors,
    );
  }

  // 4. Build upstream headers
  const upstreamHeaders: Record<string, string> = {};

  // Forward allowed auth headers from client
  for (const key of FORWARDED_HEADERS) {
    const value = request.headers.get(key);
    if (value) upstreamHeaders[key] = value;
  }

  // Inject real API key (overrides any client-sent key)
  if (env.NOVA_API_KEY) {
    upstreamHeaders['x-api-key'] = env.NOVA_API_KEY;
  }

  // Forward Content-Type for POST
  if (request.method === 'POST') {
    upstreamHeaders['Content-Type'] =
      request.headers.get('Content-Type') || 'application/json';
  }

  // 5. Read body for POST
  let body: string | null = null;
  if (request.method === 'POST') {
    body = await request.text();
  }

  // 6. Build target URL and fetch with retry
  const targetUrl = getUpstreamUrl(subpath);
  const timeoutMs = getTimeout(subpath);

  try {
    const response = await fetchWithRetry(
      targetUrl,
      {
        method: request.method,
        headers: upstreamHeaders,
        ...(body !== null ? { body } : {}),
      },
      timeoutMs,
    );

    const data = await response.text();
    const durationMs = Date.now() - start;

    if (response.status >= 400) {
      console.error(
        `[Nova Proxy ${request.method}] ${subpath} -> ${response.status} (${durationMs}ms)`,
      );
    }

    return new Response(data, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('Content-Type') || 'application/json',
        'X-Proxy-Duration': `${durationMs}ms`,
        ...cors,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    console.error(
      `[Nova Proxy ${request.method}] Error after retries:`,
      error instanceof Error ? error.message : 'Unknown error',
    );

    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      return errorResponse(
        'PROXY_TIMEOUT',
        'Nova upstream timed out after retries',
        504,
        true,
        durationMs,
        cors,
      );
    }

    if (
      error instanceof TypeError ||
      (error instanceof Error &&
        (error.message.includes('ECONNREFUSED') ||
          error.message.includes('fetch failed')))
    ) {
      return errorResponse(
        'PROXY_NETWORK_ERROR',
        'Nova upstream unreachable after retries',
        502,
        true,
        durationMs,
        cors,
      );
    }

    return errorResponse(
      'PROXY_ERROR',
      error instanceof Error
        ? error.message
        : 'Nova proxy request failed',
      502,
      false,
      durationMs,
      cors,
    );
  }
}

// ============================================================================
// Worker Entry Point
// ============================================================================

export default {
  async fetch(
    request: Request,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<Response> {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    // Only GET and POST are supported
    if (request.method !== 'GET' && request.method !== 'POST') {
      return new Response(
        JSON.stringify({
          error: 'Method not allowed',
          code: 'METHOD_NOT_ALLOWED',
          retryable: false,
        }),
        {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            Allow: 'GET, POST, OPTIONS',
            ...corsHeaders(request, env),
          },
        },
      );
    }

    return handleProxy(request, env);
  },
};
