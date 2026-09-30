'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// This error boundary catches errors in the root layout
// It must render its own <html> and <body> tags
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Log critical errors - this is a root-level failure
    console.error('Global error (root layout):', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-black">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full text-center">
            <div className="mb-8">
              <div className="w-20 h-20 mx-auto bg-near-red/10 rounded-full flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-near-red"
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

            <h1 className="text-3xl font-bold text-white mb-4">
              Application Error
            </h1>

            <p className="text-zinc-400 mb-6">
              A critical error occurred. We apologize for the inconvenience.
              Please refresh the page or try again later.
            </p>

            {error.digest && (
              <p className="text-xs text-zinc-500 mb-6">
                Error ID: {error.digest}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                type="button"
                onClick={reset}
                className="px-6 py-3 bg-near-green hover:bg-near-green/80 text-near-black font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-near-green"
              >
                Refresh page
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
