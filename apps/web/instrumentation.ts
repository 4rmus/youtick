import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

const commonInit = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: isDev ? 1.0 : 0.1,
  debug: false,
  ignoreErrors: [
    /ChunkLoadError/,
    /Loading chunk \d+ failed/,
    /ResizeObserver loop/,
    /AbortError/,
    /NetworkError when attempting to fetch/,
  ],
  beforeSend(event: Sentry.ErrorEvent) {
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
        delete event.request.headers["x-youtick-bearer"];
      }
    }
    return event;
  },
};

export async function register() {
  if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init(commonInit);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(commonInit);
  }
}

export const onRequestError = Sentry.captureRequestError;
