'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { parseNovaUrl, isPublicGroup, fetchPublicThumbnail } from '@/lib/nova';
import { isNovaUrl, isIpfsUrl } from '@/lib/nova/types';
import { useWallet } from '@/components/providers/WalletProvider';

// Module-level cache: store regular URLs directly, store Blobs for nova:// URLs
// Blobs are cached so each component mount can create its own revocable object URL
const resolvedUrlCache = new Map<string, string>();
const blobCache = new Map<string, Blob>();
// Negative cache: track failed Nova fetches to avoid retrying on every re-render (60s TTL)
const failCache = new Map<string, number>();
const FAIL_CACHE_TTL = 60_000;

interface NovaThumbnailProps {
  /** URL to display - supports nova:// and legacy IPFS URLs */
  url?: string | null;
  /** Alt text for the image */
  alt?: string;
  /** CSS class name */
  className?: string;
  /** Fallback URL if image fails to load */
  fallbackUrl?: string;
  /** Placeholder to show while loading */
  placeholder?: string;
  /** Called when image loads successfully */
  onLoad?: () => void;
  /** Called when image fails to load */
  onError?: (error: Error) => void;
}

/**
 * NovaThumbnail Component
 *
 * Displays thumbnails from both nova:// URLs and legacy IPFS URLs.
 * For nova:// URLs, it auto-joins public groups and fetches/decrypts content.
 * For legacy IPFS URLs, it displays directly via gateway.
 *
 * Features:
 * - Automatic nova:// URL parsing
 * - Public group auto-join
 * - Fallback to IPFS gateway
 * - Loading states
 * - Error handling with graceful degradation
 */
export function NovaThumbnail({
  url,
  alt = 'Thumbnail',
  className = '',
  fallbackUrl = '/placeholder-video.svg',
  placeholder,
  onLoad,
  onError
}: NovaThumbnailProps) {
  const { accountId } = useWallet();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * Get display URL from various URL formats
   */
  const resolveUrl = useCallback(async (inputUrl: string): Promise<string> => {
    // Check non-blob URL cache first
    const cached = resolvedUrlCache.get(inputUrl);
    if (cached) {
      return cached;
    }

    // Check blob cache — create a fresh object URL from cached blob
    const cachedBlob = blobCache.get(inputUrl);
    if (cachedBlob) {
      return URL.createObjectURL(cachedBlob);
    }

    let resolved: string;

    // Nova URL: nova://{groupId}/{cid}
    if (isNovaUrl(inputUrl)) {
      const parsed = parseNovaUrl(inputUrl);
      if (!parsed) {
        throw new Error('Invalid nova:// URL format');
      }

      // For public groups, try to fetch via Nova
      if (isPublicGroup(parsed.groupId)) {
        // Skip Nova if this URL failed recently
        const failedAt = failCache.get(inputUrl);
        const recentlyFailed = failedAt && Date.now() - failedAt < FAIL_CACHE_TTL;

        if (!recentlyFailed) {
          try {
            const blob = await fetchPublicThumbnail(inputUrl, accountId || undefined);
            blobCache.set(inputUrl, blob);
            return URL.createObjectURL(blob);
          } catch (err) {
            console.warn('[NovaThumbnail] Nova fetch failed, falling back to gateway');
            failCache.set(inputUrl, Date.now());
          }
        }

        resolved = `https://gateway.pinata.cloud/ipfs/${parsed.cid}`;
        resolvedUrlCache.set(inputUrl, resolved);
        return resolved;
      }

      // For non-public groups, try direct gateway
      resolved = `https://gateway.pinata.cloud/ipfs/${parsed.cid}`;
      resolvedUrlCache.set(inputUrl, resolved);
      return resolved;
    }

    // Legacy IPFS URL or direct URL
    if (isIpfsUrl(inputUrl)) {
      resolvedUrlCache.set(inputUrl, inputUrl);
      return inputUrl;
    }

    // Direct URL (http/https or relative path starting with /)
    const urlStr = inputUrl as string;
    if (urlStr.startsWith('http://') || urlStr.startsWith('https://') || urlStr.startsWith('/')) {
      resolvedUrlCache.set(inputUrl, urlStr);
      return urlStr;
    }

    // Assume it's a CID
    resolved = `https://gateway.pinata.cloud/ipfs/${urlStr}`;
    resolvedUrlCache.set(inputUrl, resolved);
    return resolved;
  }, [accountId]);

  /**
   * Load image from URL
   */
  useEffect(() => {
    if (!url) {
      setImageUrl(fallbackUrl);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const loadImage = async () => {
      setLoading(true);
      setError(null);

      try {
        const resolvedUrl = await resolveUrl(url);

        if (cancelled) return;

        // Keep track of blob URLs for cleanup
        if (resolvedUrl.startsWith('blob:')) {
          objectUrl = resolvedUrl;
        }

        setImageUrl(resolvedUrl);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;

        console.error('[NovaThumbnail] Failed to load image:', err);
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setImageUrl(fallbackUrl);
        setLoading(false);
        onError?.(error);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
      // Clean up blob URLs
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, fallbackUrl, resolveUrl, onError]);

  /**
   * Handle image load error
   */
  const handleImageError = useCallback(() => {
    console.warn('[NovaThumbnail] Image failed to load, using fallback');
    setImageUrl(fallbackUrl);
    const err = new Error('Image failed to load');
    setError(err);
    onError?.(err);
  }, [fallbackUrl, onError]);

  /**
   * Handle successful image load
   */
  const handleImageLoad = useCallback(() => {
    onLoad?.();
  }, [onLoad]);

  // Show placeholder while loading
  if (loading) {
    return (
      <div className={`bg-zinc-800 animate-pulse ${className}`}>
        {placeholder ? (
          <img
            src={placeholder}
            alt="Loading..."
            className="w-full h-full object-cover opacity-50"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <img
      src={imageUrl || fallbackUrl}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  );
}

/**
 * Helper hook for resolving Nova thumbnail URLs
 */
export function useNovaThumbnailUrl(url: string | null | undefined): {
  resolvedUrl: string | null;
  loading: boolean;
  error: Error | null;
} {
  const { accountId } = useWallet();
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!url) {
      setResolvedUrl(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      setLoading(true);
      setError(null);

      try {
        // Nova URL
        if (isNovaUrl(url)) {
          const parsed = parseNovaUrl(url);
          if (!parsed) {
            throw new Error('Invalid nova:// URL');
          }

          // Try Nova fetch for public groups
          if (isPublicGroup(parsed.groupId)) {
            const failedAt = failCache.get(url);
            const recentlyFailed = failedAt && Date.now() - failedAt < FAIL_CACHE_TTL;

            if (!recentlyFailed) {
              try {
                const blob = await fetchPublicThumbnail(url, accountId || undefined);
                if (!cancelled) {
                  setResolvedUrl(URL.createObjectURL(blob));
                  setLoading(false);
                }
                return;
              } catch {
                failCache.set(url, Date.now());
                // Fallback to gateway
              }
            }
          }

          if (!cancelled) {
            setResolvedUrl(`https://gateway.pinata.cloud/ipfs/${parsed.cid}`);
            setLoading(false);
          }
          return;
        }

        // IPFS or direct URL
        if (!cancelled) {
          setResolvedUrl(url);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
    };
  }, [url, accountId]);

  return { resolvedUrl, loading, error };
}

export default NovaThumbnail;
