'use client';

import { useEffect } from 'react';
import { useLocale } from '@/lib/i18n/I18nProvider';
import { messages } from '@/lib/i18n/messages';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// This error boundary catches errors in the root layout
// It must render its own <html> and <body> tags
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const locale = useLocale();
  const t = messages[locale].errorPage;
  useEffect(() => {
    // Log critical errors - this is a root-level failure
    console.error('Global error (root layout):', error);
  }, [error]);

  return (
    <html lang={locale}>
      <body className="bg-ink font-sans text-light">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-8">
              <div className="mx-auto flex h-20 w-20 items-center justify-center border-2 border-alert">
                <svg
                  className="h-10 w-10 text-alert"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
            </div>

            <h1 className="font-display mb-4 text-5xl">
              {t.criticalTitle}
            </h1>

            <p className="mb-6 text-light-2">
              {t.criticalDescription}
            </p>

            {error.digest && (
              <p className="mb-6 text-xs text-light-3">
                {t.errorId}{error.digest}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={reset}
                className="min-h-12 rounded-xs bg-light px-6 py-3 font-extrabold text-ink transition-colors hover:bg-light-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
              >
                {t.retry}
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="min-h-12 rounded-xs border border-light/40 px-6 py-3 font-semibold text-light transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ice"
              >
                {t.refresh}
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
