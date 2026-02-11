import { NextRequest, NextResponse } from 'next/server';

/**
 * Nova SDK CORS Proxy (catch-all) with retry, timeout, and error differentiation
 *
 * Nova SDK makes browser requests to nova-sdk.com and nova-mcp.fastmcp.app
 * which don't support CORS from localhost/custom domains.
 * This route proxies those requests server-side.
 *
 * Routing:
 *   /api/nova-proxy/api/auth/*  → https://nova-sdk.com/api/auth/*
 *   /api/nova-proxy/tools/*     → https://nova-mcp.fastmcp.app/tools/*
 *   /api/nova-proxy/*           → https://nova-mcp.fastmcp.app/*
 */

const AUTH_BASE = 'https://nova-sdk.com';
const MCP_BASE = 'https://nova-mcp.fastmcp.app';

/** Server-only API key — never exposed to the client bundle */
const SERVER_API_KEY = process.env.NOVA_API_KEY;

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
const RETRYABLE_STATUSES = new Set([502, 503, 504, 429]);
const BACKOFF_MS = [500, 1000, 2000];

/** Simple in-memory rate limiter per IP (resets on server restart) */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 60; // 60 requests per minute per IP

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

/** Headers that must never appear in logs */
const SENSITIVE_HEADERS = new Set(['x-api-key', 'authorization', 'x-session-token']);

/** Sanitize response body for logging - strip potential credential leakage */
function sanitizeLogBody(body: string, maxLen = 500): string {
  let sanitized = body.slice(0, maxLen);
  // Redact anything that looks like an API key or token value
  sanitized = sanitized.replace(
    /("(?:api[_-]?key|token|authorization|secret|password|x-api-key)"\s*:\s*)"[^"]*"/gi,
    '$1"[REDACTED]"'
  );
  // Redact Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
  return sanitized;
}

/** Path-based timeout configuration (ms) */
function getTimeout(subpath: string): number {
  if (subpath.startsWith('/api/auth/')) return 10_000;   // auth: 10s
  return 30_000; // default: 30s (all Nova proxy requests are small JSON now)
}

/** Fetch with retry, timeout, and error differentiation */
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

  // All retries exhausted — throw for caller to handle
  throw lastError;
}

/** Build structured error response */
function errorResponse(
  code: string,
  message: string,
  status: number,
  retryable: boolean,
  durationMs: number,
) {
  return NextResponse.json(
    { error: message, code, retryable },
    {
      status,
      headers: { 'X-Proxy-Duration': `${durationMs}ms` },
    },
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const start = Date.now();

  try {
    // Rate limit check
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return errorResponse('RATE_LIMITED', 'Too many requests', 429, true, Date.now() - start);
    }

    const { path } = await params;
    const subpath = '/' + path.join('/');

    if (!ALLOWED_PATHS.has(subpath)) {
      return errorResponse('PATH_NOT_ALLOWED', `Proxy path not allowed: ${subpath}`, 404, false, Date.now() - start);
    }

    const timeoutMs = getTimeout(subpath);

    const isAuthPath = subpath.startsWith('/api/auth/') || subpath === '/attestation';
    const targetUrl = isAuthPath
      ? `${AUTH_BASE}${subpath}`
      : `${MCP_BASE}${subpath}`;

    const headers: Record<string, string> = {};

    // Forward auth headers
    for (const key of ['authorization', 'x-api-key', 'x-session-token', 'x-account-id']) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
    }

    // Inject real API key server-side (overrides any client-sent key)
    if (SERVER_API_KEY) {
      headers['x-api-key'] = SERVER_API_KEY;
    }

    const response = await fetchWithRetry(
      targetUrl,
      { method: 'GET', headers },
      timeoutMs,
    );

    const data = await response.text();
    const durationMs = Date.now() - start;

    if (response.status >= 400) {
      console.error(
        `[Nova Proxy GET] ${subpath} → ${response.status} (${durationMs}ms) Body: ${sanitizeLogBody(data)}`,
      );
    } else {
      console.log(
        `[Nova Proxy GET] ${subpath} → ${response.status} (${durationMs}ms)`,
      );
    }

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('Content-Type') || 'application/json',
        'X-Proxy-Duration': `${durationMs}ms`,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    // Log error type only - never log full error which may contain headers/credentials
    console.error('[Nova Proxy GET] Error after retries:', error instanceof Error ? error.message : 'Unknown error');

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
      );
    }

    return errorResponse(
      'PROXY_ERROR',
      error instanceof Error ? error.message : 'Nova proxy request failed',
      502,
      false,
      durationMs,
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const start = Date.now();

  try {
    // Rate limit check
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(clientIp)) {
      return errorResponse('RATE_LIMITED', 'Too many requests', 429, true, Date.now() - start);
    }

    const { path } = await params;
    const subpath = '/' + path.join('/');

    if (!ALLOWED_PATHS.has(subpath)) {
      return errorResponse('PATH_NOT_ALLOWED', `Proxy path not allowed: ${subpath}`, 404, false, Date.now() - start);
    }

    const timeoutMs = getTimeout(subpath);

    const isAuthPath = subpath.startsWith('/api/auth/') || subpath === '/attestation';
    const targetUrl = isAuthPath
      ? `${AUTH_BASE}${subpath}`
      : `${MCP_BASE}${subpath}`;

    const headers: Record<string, string> = {
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
    };

    // Forward auth headers
    for (const key of ['authorization', 'x-api-key', 'x-session-token', 'x-account-id']) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
    }

    // Inject real API key server-side (overrides any client-sent key)
    if (SERVER_API_KEY) {
      headers['x-api-key'] = SERVER_API_KEY;
    }

    // All Nova proxy POST requests are small JSON now (auth, group mgmt, key storage).
    // Large file uploads go directly to Crust via the client.
    const body = await request.text();
    const response = await fetchWithRetry(
      targetUrl,
      { method: 'POST', headers, body },
      timeoutMs,
    );

    const data = await response.text();
    const durationMs = Date.now() - start;

    if (response.status >= 400) {
      console.error(
        `[Nova Proxy POST] ${subpath} → ${response.status} (${durationMs}ms) Body: ${sanitizeLogBody(data)}`,
      );
    } else {
      console.log(
        `[Nova Proxy POST] ${subpath} → ${response.status} (${durationMs}ms)`,
      );
    }

    return new NextResponse(data, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('Content-Type') || 'application/json',
        'X-Proxy-Duration': `${durationMs}ms`,
      },
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    // Log error type only - never log full error which may contain headers/credentials
    console.error('[Nova Proxy POST] Error after retries:', error instanceof Error ? error.message : 'Unknown error');

    // Differentiate error types
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
      );
    }

    return errorResponse(
      'PROXY_ERROR',
      error instanceof Error ? error.message : 'Nova proxy request failed',
      502,
      false,
      durationMs,
    );
  }
}
