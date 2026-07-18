const isDev = process.env.NODE_ENV === "development";
const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === "true";
type RouterTransitionArgs = Parameters<typeof import("@sentry/nextjs").captureRouterTransitionStart>;
let captureRouterTransitionStart: (...args: RouterTransitionArgs) => void = () => {};

function redactUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  try {
    const isAbsolute = /^[a-z][a-z\d+.-]*:/i.test(value);
    const url = new URL(value, "https://redaction.invalid");
    for (const key of ["secret", "key", "turnstileToken"]) {
      if (url.searchParams.has(key)) url.searchParams.set(key, "[Filtered]");
    }
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

if (sentryEnabled && process.env.NEXT_PUBLIC_SENTRY_DSN && !isDev) {
  void import("@sentry/nextjs").then((Sentry) => {
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
          event.request.url = redactUrl(event.request.url);
          delete event.request.cookies;
          if (event.request.headers) {
            delete event.request.headers.authorization;
            delete event.request.headers.cookie;
            delete event.request.headers["x-youtick-bearer"];
          }
        }
        for (const breadcrumb of event.breadcrumbs || []) {
          if (typeof breadcrumb.data?.url === "string") {
            breadcrumb.data.url = redactUrl(breadcrumb.data.url);
          }
        }
        return event;
      },
    });
    captureRouterTransitionStart = Sentry.captureRouterTransitionStart;
  });
}

export const onRouterTransitionStart = (...args: RouterTransitionArgs) =>
  captureRouterTransitionStart(...args);
