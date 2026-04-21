import * as Sentry from "@sentry/nextjs";

const isDev = process.env.NODE_ENV === "development";

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: isDev ? 1.0 : 0.1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: isDev ? 1.0 : 0.1,
    debug: false,
    ignoreErrors: [
      /ChunkLoadError/,
      /Loading chunk \d+ failed/,
      /ResizeObserver loop/,
      /AbortError/,
      /NetworkError when attempting to fetch/,
      /Non-Error promise rejection captured/,
    ],
    beforeSend(event) {
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
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
