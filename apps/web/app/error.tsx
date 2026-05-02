'use client';

import { useEffect } from 'react';
import { useLanguage } from '@/components/providers/LanguageContext';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error }: ErrorProps) {
  const { t } = useLanguage();
  const copy = t.system_messages;
  const isChunkError = error.name === 'ChunkLoadError' || error.message?.includes('ChunkLoadError');
  const retryKey = '__ytk_chunk_retry';
  const shouldAutoRetry = isChunkError && (() => {
    if (typeof window === 'undefined') return false;
    try {
      const retries = parseInt(sessionStorage.getItem(retryKey) || '0', 10);
      return retries < 3;
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    console.error('Page error:', error);

    // Auto-reload for ChunkLoadError (IPFS gateway blip)
    if (shouldAutoRetry) {
      let retries = 0;
      try { retries = parseInt(sessionStorage.getItem(retryKey) || '0', 10); } catch {}

      try { sessionStorage.setItem(retryKey, String(retries + 1)); } catch {}
      const delay = Math.min(1000 * Math.pow(2, retries), 8000);
      const timer = setTimeout(() => window.location.reload(), delay);
      return () => clearTimeout(timer);
    }
  }, [error, shouldAutoRetry]);

  if (shouldAutoRetry) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-12 h-12 mx-auto border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6" />
          <p className="text-gray-400">{copy.loading_retrying}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <div className="w-16 h-16 mx-auto bg-red-500/10 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-4">
          {isChunkError ? copy.loading_failed : copy.something_wrong}
        </h1>

        <p className="text-gray-400 mb-6">
          {isChunkError
            ? copy.resource_retry_desc
            : copy.unexpected_desc}
        </p>

        {error.digest && (
          <p className="text-xs text-gray-500 mb-6">{copy.error_id}: {error.digest}</p>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            {isChunkError ? copy.reload_page : copy.try_again}
          </button>
          <button
            onClick={() => window.location.href = '/'}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
          >
            {copy.go_home}
          </button>
        </div>
      </div>
    </div>
  );
}
