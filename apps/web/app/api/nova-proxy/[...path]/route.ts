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

const MAX_RETRIES = 3;
const RETRYABLE_STATUSES = new Set([502, 503, 504, 429]);
const BACKOFF_MS = [500, 1000, 2000];

/** Path-based timeout configuration (ms) */
function getTimeout(subpath: string): number {
  if (subpath.startsWith('/api/auth/')) return 10_000;   // auth: 10s
  if (isUploadPath(subpath)) return 120_000; // upload/finalize: 2 min
  return 30_000; // default: 30s
}

/** Detect upload-related paths that may carry large binary bodies */
function isUploadPath(subpath: string): boolean {
  return (
    subpath.includes('/upload') ||
    subpath.includes('/finalize') ||
    subpath.includes('/file')
  );
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
    const { path } = await params;
    const subpath = '/' + path.join('/');
    const timeoutMs = getTimeout(subpath);

    const targetUrl = subpath.startsWith('/api/auth/')
      ? `${AUTH_BASE}${subpath}`
      : `${MCP_BASE}${subpath}`;

    const headers: Record<string, string> = {};

    // Forward auth headers
    for (const key of ['authorization', 'x-api-key', 'x-session-token', 'x-account-id']) {
      const value = request.headers.get(key);
      if (value) headers[key] = value;
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
        `[Nova Proxy GET] ${subpath} → ${response.status} (${durationMs}ms) Body: ${data.slice(0, 500)}`,
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
    console.error('[Nova Proxy GET] Error after retries:', error);

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
    const { path } = await params;
    const subpath = '/' + path.join('/');
    const timeoutMs = getTimeout(subpath);

    const targetUrl = subpath.startsWith('/api/auth/')
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

    // Forward content-length for binary uploads
    const contentLength = request.headers.get('content-length');
    if (contentLength) {
      headers['content-length'] = contentLength;
    }

    let response: Response;

    if (isUploadPath(subpath)) {
      // Upload paths: stream the body directly to avoid body size limits.
      // ReadableStream can only be consumed once so no retry for uploads.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: request.body,
          signal: controller.signal,
          // @ts-expect-error -- duplex required for streaming request bodies
          duplex: 'half',
        });
        clearTimeout(timer);
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
    } else {
      // Non-upload paths: buffer body as text (small JSON payloads), retry on failure
      const body = await request.text();
      response = await fetchWithRetry(
        targetUrl,
        { method: 'POST', headers, body },
        timeoutMs,
      );
    }

    const data = await response.text();
    const durationMs = Date.now() - start;

    if (response.status >= 400) {
      console.error(
        `[Nova Proxy] ${subpath} → ${response.status} (${durationMs}ms) Body: ${data.slice(0, 500)}`,
      );
    } else {
      console.log(
        `[Nova Proxy] ${subpath} → ${response.status} (${durationMs}ms)`,
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
    console.error('[Nova Proxy] Error after retries:', error);

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
